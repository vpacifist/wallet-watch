(function initWalletWatchSimulationEngine(globalScope) {
  function createSimulationEngine(deps) {
    const {
      state,
      performance,
      findBlockAtOrAfter,
      findSwapExit,
      getBlock,
      buildRebalanceRow,
      readRewardInside,
      getAeroPrice,
      ensureActiveSimulation,
      priceForTick,
      priceFromSqrtX96,
      simulationReliability,
      impactRiskDetails,
      reliabilityDetailsText,
      impactShare,
      Q128,
      AERO_DECIMALS,
      recordSimulationStepDuration,
      simulationProgressText,
      setSimulationNotice,
      renderSimulationTable,
      updateSimulationControls,
    } = deps;

    function snapshotState() {
      return {
        tickLower: state.sim.tickLower,
        tickUpper: state.sim.tickUpper,
        rangeWidth: state.sim.rangeWidth,
        anchorTick: state.sim.anchorTick,
        startGridTick: state.sim.startGridTick,
        rangeStepTicks: state.sim.rangeStepTicks,
        liquidityRaw: state.sim.liquidityRaw,
        liquidityHuman: state.sim.liquidityHuman,
        rewardStart: state.sim.rewardStart,
        rewardLast: state.sim.rewardLast,
        aeroUnharvested: state.sim.aeroUnharvested,
        aeroBaseUnharvested: state.sim.aeroBaseUnharvested,
        aeroHaircutUnharvested: state.sim.aeroHaircutUnharvested,
        aeroHarvestedUsdc: state.sim.aeroHarvestedUsdc,
        aeroBaseHarvestedUsdc: state.sim.aeroBaseHarvestedUsdc,
        aeroHaircutUsdc: state.sim.aeroHaircutUsdc,
        aeroPriceReliability: state.sim.aeroPriceReliability,
        aeroPriceAgeSeconds: state.sim.aeroPriceAgeSeconds,
      };
    }

    function applyState(snapshot, defaultRangeWidth) {
      if (!snapshot) return;
      state.sim.tickLower = snapshot.tickLower;
      state.sim.tickUpper = snapshot.tickUpper;
      state.sim.rangeWidth = snapshot.rangeWidth || defaultRangeWidth;
      state.sim.anchorTick = snapshot.anchorTick;
      state.sim.startGridTick = snapshot.startGridTick || snapshot.tickLower || 0;
      state.sim.rangeStepTicks = snapshot.rangeStepTicks || 0;
      state.sim.liquidityRaw = snapshot.liquidityRaw;
      state.sim.liquidityHuman = snapshot.liquidityHuman;
      state.sim.rewardStart = snapshot.rewardStart;
      state.sim.rewardLast = snapshot.rewardLast || snapshot.rewardStart || 0n;
      state.sim.aeroUnharvested = snapshot.aeroUnharvested || 0;
      state.sim.aeroBaseUnharvested = snapshot.aeroBaseUnharvested || snapshot.aeroUnharvested || 0;
      state.sim.aeroHaircutUnharvested = snapshot.aeroHaircutUnharvested || 0;
      state.sim.aeroHarvestedUsdc = snapshot.aeroHarvestedUsdc;
      state.sim.aeroBaseHarvestedUsdc = snapshot.aeroBaseHarvestedUsdc || snapshot.aeroHarvestedUsdc || 0;
      state.sim.aeroHaircutUsdc = snapshot.aeroHaircutUsdc || 0;
      state.sim.aeroPriceReliability = snapshot.aeroPriceReliability;
      state.sim.aeroPriceAgeSeconds = snapshot.aeroPriceAgeSeconds || 0;
    }

    function amountsForPosition(price) {
      const { tickLower, tickUpper, liquidityHuman } = state.sim;
      const lower = priceForTick(tickLower);
      const upper = priceForTick(tickUpper);
      const sqrtA = Math.sqrt(lower);
      const sqrtB = Math.sqrt(upper);
      const sqrtP = Math.sqrt(price);
      if (price <= lower) {
        const weth = liquidityHuman * (sqrtB - sqrtA) / (sqrtA * sqrtB);
        return { weth, usdc: 0, value: weth * price };
      }
      if (price >= upper) {
        const usdc = liquidityHuman * (sqrtB - sqrtA);
        return { weth: 0, usdc, value: usdc };
      }
      const weth = liquidityHuman * (sqrtB - sqrtP) / (sqrtP * sqrtB);
      const usdc = liquidityHuman * (sqrtP - sqrtA);
      return { weth, usdc, value: weth * price + usdc };
    }

    function dilutedAeroRaw(rewardState) {
      if (rewardState.rewardInside <= state.sim.rewardLast || state.sim.liquidityRaw <= 0n) return 0n;
      const totalLiquidity = rewardState.stakedLiquidity + state.sim.liquidityRaw;
      if (totalLiquidity <= 0n) return 0n;
      const growthDelta = rewardState.rewardInside - state.sim.rewardLast;
      return state.sim.liquidityRaw * growthDelta * rewardState.stakedLiquidity / totalLiquidity / Q128;
    }

    function accrueAeroRewards(rewardState) {
      const raw = dilutedAeroRaw(rewardState);
      if (raw > 0n) {
        const baseAero = Number(raw) / Number(AERO_DECIMALS);
        const haircut = Math.min(0.5, impactShare(rewardState));
        const conservativeAero = baseAero * (1 - haircut);
        state.sim.aeroBaseUnharvested += baseAero;
        state.sim.aeroHaircutUnharvested += baseAero - conservativeAero;
        state.sim.aeroUnharvested += conservativeAero;
      }
      if (rewardState.rewardInside > state.sim.rewardLast) state.sim.rewardLast = rewardState.rewardInside;
      return state.sim.aeroUnharvested;
    }

    function aeroTotalsUsdc(aeroPrice) {
      return {
        conservative: state.sim.aeroHarvestedUsdc + state.sim.aeroUnharvested * aeroPrice,
        base: state.sim.aeroBaseHarvestedUsdc + state.sim.aeroBaseUnharvested * aeroPrice,
        haircut: state.sim.aeroHaircutUsdc + state.sim.aeroHaircutUnharvested * aeroPrice,
      };
    }

    function aeroEventUsdc(aeroPrice) {
      return {
        conservative: state.sim.aeroUnharvested * aeroPrice,
        base: state.sim.aeroBaseUnharvested * aeroPrice,
        haircut: state.sim.aeroHaircutUnharvested * aeroPrice,
      };
    }

    async function buildSimulationRow(index, eventName, blockOverride = null, runToken = null) {
      const row = state.rows[index];
      const timestamp = Math.floor(new Date(row.time).getTime() / 1000);
      const afterBlock = state.sim.rows.length ? state.sim.rows[state.sim.rows.length - 1].blockNumber : 1;
      const block = blockOverride || await findBlockAtOrAfter(timestamp, afterBlock);
      const rewardState = await readRewardInside(block.number, state.sim.tickLower, state.sim.tickUpper);
      const aeroPrice = await getAeroPrice(block.number);
      ensureActiveSimulation(runToken);
      const previousAeroTotals = aeroTotalsUsdc(aeroPrice);
      accrueAeroRewards(rewardState);
      const aeroTotals = aeroTotalsUsdc(aeroPrice);
      const aeroEvent = {
        conservative: aeroTotals.conservative - previousAeroTotals.conservative,
        base: aeroTotals.base - previousAeroTotals.base,
        haircut: aeroTotals.haircut - previousAeroTotals.haircut,
      };
      const price = priceFromSqrtX96(rewardState.sqrtPriceX96);
      const amounts = amountsForPosition(price);
      const reliability = simulationReliability(row, block, rewardState);
      return {
        event: eventName,
        index,
        blockNumber: block.number,
        value: amounts.value,
        price,
        weth: amounts.weth,
        usdc: amounts.usdc,
        aeroUsdc: aeroEvent.conservative,
        aeroTotalUsdc: aeroTotals.conservative,
        aeroBaseUsdc: aeroEvent.base,
        aeroHaircutUsdc: aeroEvent.haircut,
        aeroPrice,
        reliability: reliability.score,
        reliabilityDetails: reliabilityDetailsText(reliability.parts),
        impactDetails: impactRiskDetails(rewardState, aeroPrice, aeroEvent),
        stateAfter: snapshotState(),
      };
    }

    async function stepForward(options = {}) {
      const shouldRender = options.render !== false;
      if (!state.sim.started || state.sim.stopped || state.sim.stepInProgress) return false;
      const nextIndex = state.sim.currentIndex + 1;
      if (nextIndex > state.sim.endIndex || nextIndex >= state.rows.length) {
        state.sim.stopped = true;
        state.sim.autoRunning = false;
        if (shouldRender) {
          setSimulationNotice({ status: "Симуляция дошла до даты конца.", details: simulationProgressText(), estimate: "" });
          updateSimulationControls();
        }
        return false;
      }

      const runToken = state.sim.runToken;
      state.sim.stepInProgress = true;
      if (shouldRender) updateSimulationControls();
      const stepStartedAt = performance.now();
      const previous = state.sim.rows[state.sim.rows.length - 1];
      const nextTimestamp = Math.floor(new Date(state.rows[nextIndex].time).getTime() / 1000);
      if (shouldRender) setSimulationNotice({ status: "Считаю следующую свечу...", details: simulationProgressText(), estimate: "" });

      try {
        const nextBlock = await findBlockAtOrAfter(nextTimestamp, previous.blockNumber);
        const exit = await findSwapExit(previous.blockNumber, nextBlock.number, state.sim.tickLower, state.sim.tickUpper);
        if (runToken !== state.sim.runToken || !state.sim.started) return false;
        state.sim.currentIndex = nextIndex;

        if (exit) {
          const rebalanceBlock = await getBlock(exit.blockNumber);
          if (runToken !== state.sim.runToken || !state.sim.started) return false;
          const rebalanceRow = await buildRebalanceRow(nextIndex, exit, rebalanceBlock, runToken);
          if (runToken !== state.sim.runToken || !state.sim.started) return false;
          state.sim.rows.push(rebalanceRow);
          state.sim.activeRowIndex = nextIndex;
          state.sim.stopped = false;
          if (shouldRender) setSimulationNotice({ status: "Rebalance рассчитан.", details: simulationProgressText(), estimate: "" });
        } else {
          const simulationRow = await buildSimulationRow(nextIndex, "price change", nextBlock, runToken);
          if (runToken !== state.sim.runToken || !state.sim.started) return false;
          state.sim.rows.push(simulationRow);
          state.sim.activeRowIndex = nextIndex;
          recordSimulationStepDuration(stepStartedAt);
          if (shouldRender) setSimulationNotice({ status: "Свеча рассчитана.", details: simulationProgressText(), estimate: "" });
        }

        if (exit) {
          recordSimulationStepDuration(stepStartedAt);
          if (shouldRender) setSimulationNotice({ status: "Rebalance рассчитан.", details: simulationProgressText(), estimate: "" });
        }
        if (shouldRender) renderSimulationTable(true);
        return true;
      } catch (error) {
        if (runToken !== state.sim.runToken || !state.sim.started) return false;
        state.sim.stopped = true;
        state.sim.autoRunning = false;
        setSimulationNotice(`Симуляция остановлена: ${error.message}`);
        renderSimulationTable();
        return false;
      } finally {
        if (runToken === state.sim.runToken) {
          state.sim.stepInProgress = false;
          if (shouldRender) updateSimulationControls();
        }
      }
    }

    async function runAutoLoop(runToken, loopId) {
      state.sim.lastFastRenderAt = performance.now();
      while (
        state.sim.autoRunning &&
        state.sim.started &&
        !state.sim.stopped &&
        runToken === state.sim.runToken &&
        loopId === state.sim.autoLoopId
      ) {
        const advanced = await stepForward({ render: false });
        if (!advanced) break;
        const now = performance.now();
        if (now - state.sim.lastFastRenderAt >= state.sim.fastRenderEveryMs) {
          state.sim.lastFastRenderAt = now;
          setSimulationNotice({
            status: "Симуляция считается...",
            details: simulationProgressText(),
            estimate: "",
          });
          renderSimulationTable(true);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      if (runToken === state.sim.runToken && loopId === state.sim.autoLoopId) {
        state.sim.autoRunning = false;
        if (state.sim.currentIndex >= state.sim.endIndex || state.sim.stopped) {
          setSimulationNotice({ status: "Симуляция дошла до даты конца.", details: simulationProgressText(), estimate: "" });
        }
        renderSimulationTable(true);
        updateSimulationControls();
      }
    }

    return {
      stepForward,
      runAutoLoop,
      snapshotState,
      applyState,
      amountsForPosition,
      dilutedAeroRaw,
      accrueAeroRewards,
      aeroTotalsUsdc,
      aeroEventUsdc,
      buildSimulationRow,
    };
  }

  const api = { create: createSimulationEngine, createSimulationEngine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.WalletWatchSimulationEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
