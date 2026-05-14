(function initWalletWatchSimulationEngine(globalScope) {
  function createSimulationEngine(deps) {
    const {
      state,
      performance,
      findBlockAtOrAfter,
      findSwapExit,
      estimateLpFees,
      getBlock,
      readRewardInside,
      getAeroPrice,
      ensureActiveSimulation,
      priceForTick,
      priceFromSqrtX96,
      computePositionPlanForRange,
      tickRangeAroundTick,
      estimateHistoricalSwap,
      rewardStateReliability,
      blockTimeReliability,
      priceAgreementReliability,
      conservativeReliability,
      scoreFromThresholds,
      fmtNumber,
      fmtUsdc,
      reliabilityDetailsText,
      AERODROME_TICK_SPACING,
      REBALANCE_MANUAL_FEE_BPS,
      REBALANCE_GAS_UNITS,
      REBALANCE_L1_DATA_FEE_ETH,
      REBALANCE_FALLBACK_SLIPPAGE_BPS,
      AERO_IMPACT_HAIRCUT_MAX,
      Q128,
      AERO_DECIMALS,
      recordSimulationStepDuration,
      recordSimulationTiming,
      simulationProgressText,
      setSimulationNotice,
      renderSimulationTable,
      updateSimulationControls,
      isServerWorker = false,
      secondsPerBlock = 2,
    } = deps;

    const SEQUENTIAL_FORWARD_SCAN_LIMIT = 4;
    let sequentialBlockCursor = null;

    function rememberSequentialBlockCursor(block, metadata = null) {
      if (block && Number.isFinite(block.number) && Number.isFinite(block.timestamp)) {
        const existingHits = sequentialBlockCursor?.block?.number === block.number
          ? sequentialBlockCursor.exactCadenceHits || 0
          : 0;
        sequentialBlockCursor = {
          block,
          exactCadenceHits: metadata?.exactCadenceHits ?? existingHits,
        };
      }
    }

    function resetSequentialBlockCursor() {
      sequentialBlockCursor = null;
    }

    async function binarySearchFirstBlockAtOrAfter(timestampSeconds, low, high) {
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const block = await getBlock(mid);
        if (block.timestamp < timestampSeconds) low = mid + 1;
        else high = mid;
      }
      return await getBlock(low);
    }

    async function scanAroundEstimateForSequentialBlock(timestampSeconds, afterBlock, estimateBlock) {
      if (estimateBlock.timestamp < timestampSeconds) {
        let candidate = estimateBlock;
        for (let offset = 1; offset <= SEQUENTIAL_FORWARD_SCAN_LIMIT; offset += 1) {
          candidate = await getBlock(estimateBlock.number + offset);
          if (candidate.timestamp >= timestampSeconds) return { block: candidate, exactEstimate: false };
        }
        return null;
      }

      let firstAtOrAfter = estimateBlock;
      for (let offset = 1; offset <= SEQUENTIAL_FORWARD_SCAN_LIMIT && estimateBlock.number - offset >= afterBlock; offset += 1) {
        const previous = await getBlock(estimateBlock.number - offset);
        if (previous.timestamp < timestampSeconds) {
          return { block: firstAtOrAfter, exactEstimate: firstAtOrAfter.number === estimateBlock.number };
        }
        firstAtOrAfter = previous;
      }
      if (firstAtOrAfter.number === afterBlock) {
        return { block: firstAtOrAfter, exactEstimate: firstAtOrAfter.number === estimateBlock.number };
      }
      return null;
    }

    async function findSequentialBlockAtOrAfter(timestampSeconds, afterBlock = 1) {
      const startedAt = performance.now();
      try {
        const floorBlock = Math.max(1, afterBlock || 1);
        let cursorBlock = sequentialBlockCursor?.block;
        if (!cursorBlock || cursorBlock.number !== floorBlock) {
          cursorBlock = await getBlock(floorBlock);
        }
        if (cursorBlock.timestamp >= timestampSeconds) {
          rememberSequentialBlockCursor(cursorBlock);
          return cursorBlock;
        }

        const directScanSeconds = SEQUENTIAL_FORWARD_SCAN_LIMIT * Math.max(1, secondsPerBlock);
        if (timestampSeconds - cursorBlock.timestamp <= directScanSeconds) {
          let previous = cursorBlock;
          for (let offset = 1; offset <= SEQUENTIAL_FORWARD_SCAN_LIMIT; offset += 1) {
            const candidate = await getBlock(cursorBlock.number + offset);
            if (candidate.timestamp >= timestampSeconds) {
              rememberSequentialBlockCursor(candidate);
              return candidate;
            }
            previous = candidate;
          }
          cursorBlock = previous;
        }

        const effectiveSecondsPerBlock = Math.max(1, secondsPerBlock);
        const estimatedOffset = Math.max(1, Math.ceil((timestampSeconds - cursorBlock.timestamp) / effectiveSecondsPerBlock));
        let estimateNumber = Math.max(floorBlock, cursorBlock.number + estimatedOffset);
        let estimateBlock = await getBlock(estimateNumber);
        const blockDelta = estimateNumber - cursorBlock.number;
        const timestampDelta = estimateBlock.timestamp - cursorBlock.timestamp;
        const estimateMatchesCadence = blockDelta > 0
          && timestampDelta === blockDelta * effectiveSecondsPerBlock
          && estimateBlock.timestamp >= timestampSeconds
          && estimateBlock.timestamp - timestampSeconds < effectiveSecondsPerBlock;
        if (estimateMatchesCadence && (sequentialBlockCursor?.exactCadenceHits || 0) > 0) {
          rememberSequentialBlockCursor(estimateBlock, {
            exactCadenceHits: sequentialBlockCursor.exactCadenceHits + 1,
          });
          return estimateBlock;
        }

        const localResult = await scanAroundEstimateForSequentialBlock(timestampSeconds, floorBlock, estimateBlock);
        if (localResult) {
          const nextExactCadenceHits = estimateMatchesCadence && localResult.exactEstimate
            ? (sequentialBlockCursor?.exactCadenceHits || 0) + 1
            : 0;
          rememberSequentialBlockCursor(localResult.block, { exactCadenceHits: nextExactCadenceHits });
          return localResult.block;
        }

        let low = cursorBlock.number + 1;
        let high = estimateNumber;
        if (estimateBlock.timestamp < timestampSeconds) {
          low = estimateNumber + 1;
          let span = Math.max(SEQUENTIAL_FORWARD_SCAN_LIMIT, estimatedOffset);
          do {
            high = estimateNumber + span;
            estimateBlock = await getBlock(high);
            if (estimateBlock.timestamp >= timestampSeconds) break;
            low = high + 1;
            estimateNumber = high;
            span *= 2;
          } while (true);
        }

        const result = await binarySearchFirstBlockAtOrAfter(timestampSeconds, Math.max(low, floorBlock), high);
        rememberSequentialBlockCursor(result);
        return result;
      } finally {
        recordSimulationTiming("findBlockAtOrAfter", startedAt);
      }
    }

    function snapshotState() {
      return {
        tickLower: state.sim.tickLower,
        tickUpper: state.sim.tickUpper,
        rangeWidth: state.sim.rangeWidth,
        anchorTick: state.sim.anchorTick,
        startGridTick: state.sim.startGridTick,
        rangeStepTicks: state.sim.rangeStepTicks,
        lastExitBlockNumber: state.sim.lastExitBlockNumber,
        lastExitLogIndex: state.sim.lastExitLogIndex,
        liquidityRaw: state.sim.liquidityRaw,
        liquidityHuman: state.sim.liquidityHuman,
        rewardStart: state.sim.rewardStart,
        rewardLast: state.sim.rewardLast,
        feeGrowthInside0Last: state.sim.feeGrowthInside0Last,
        feeGrowthInside1Last: state.sim.feeGrowthInside1Last,
        feeDilutionLiquidityLast: state.sim.feeDilutionLiquidityLast,
        rewardDilutionLiquidityLast: state.sim.rewardDilutionLiquidityLast,
        aeroUnharvested: state.sim.aeroUnharvested,
        aeroBaseUnharvested: state.sim.aeroBaseUnharvested,
        aeroHaircutUnharvested: state.sim.aeroHaircutUnharvested,
        aeroHarvestedUsdc: state.sim.aeroHarvestedUsdc,
        aeroBaseHarvestedUsdc: state.sim.aeroBaseHarvestedUsdc,
        aeroHaircutUsdc: state.sim.aeroHaircutUsdc,
        lpFeesWeth: state.sim.lpFeesWeth,
        lpFeesUsdc: state.sim.lpFeesUsdc,
        lpFeesUsdcValue: state.sim.lpFeesUsdcValue,
        lpMode: state.sim.lpMode,
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
      state.sim.lastExitBlockNumber = snapshot.lastExitBlockNumber || 0;
      state.sim.lastExitLogIndex = Number.isFinite(snapshot.lastExitLogIndex) ? snapshot.lastExitLogIndex : -1;
      state.sim.liquidityRaw = snapshot.liquidityRaw;
      state.sim.liquidityHuman = snapshot.liquidityHuman;
      state.sim.rewardStart = snapshot.rewardStart;
      state.sim.rewardLast = snapshot.rewardLast || snapshot.rewardStart || 0n;
      state.sim.feeGrowthInside0Last = snapshot.feeGrowthInside0Last || 0n;
      state.sim.feeGrowthInside1Last = snapshot.feeGrowthInside1Last || 0n;
      state.sim.feeDilutionLiquidityLast = snapshot.feeDilutionLiquidityLast || 0n;
      state.sim.rewardDilutionLiquidityLast = snapshot.rewardDilutionLiquidityLast || 0n;
      state.sim.aeroUnharvested = snapshot.aeroUnharvested || 0;
      state.sim.aeroBaseUnharvested = snapshot.aeroBaseUnharvested || snapshot.aeroUnharvested || 0;
      state.sim.aeroHaircutUnharvested = snapshot.aeroHaircutUnharvested || 0;
      state.sim.aeroHarvestedUsdc = snapshot.aeroHarvestedUsdc;
      state.sim.aeroBaseHarvestedUsdc = snapshot.aeroBaseHarvestedUsdc || snapshot.aeroHarvestedUsdc || 0;
      state.sim.aeroHaircutUsdc = snapshot.aeroHaircutUsdc || 0;
      state.sim.lpFeesWeth = snapshot.lpFeesWeth || 0;
      state.sim.lpFeesUsdc = snapshot.lpFeesUsdc || 0;
      state.sim.lpFeesUsdcValue = snapshot.lpFeesUsdcValue || 0;
      state.sim.lpMode = snapshot.lpMode || "staked";
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

    function isPositionActiveAtTick(rewardState) {
      return rewardState.tick >= state.sim.tickLower && rewardState.tick < state.sim.tickUpper;
    }

    function averageLiquidity(a, b) {
      const left = BigInt(a || 0n);
      const right = BigInt(b || 0n);
      if (left > 0n && right > 0n) return (left + right) / 2n;
      return left > 0n ? left : right;
    }

    function activeBaseLiquidity(rewardState) {
      if (isPositionActiveAtTick(rewardState) && rewardState.activeLiquidity > 0n) return rewardState.activeLiquidity;
      return 0n;
    }

    function rangeAwareBaseLiquidity(rewardState) {
      return activeBaseLiquidity(rewardState) || rewardState.stakedLiquidity;
    }

    function impactShare(rewardState) {
      const total = rangeAwareBaseLiquidity(rewardState) + state.sim.liquidityRaw;
      if (total <= 0n) return 0;
      return Number(state.sim.liquidityRaw * 1000000n / total) / 1000000;
    }

    function dilutedAeroRaw(rewardState) {
      if (rewardState.rewardInside <= state.sim.rewardLast || state.sim.liquidityRaw <= 0n) return 0n;
      const growthDelta = rewardState.rewardInside - state.sim.rewardLast;
      const baseLiquidity = averageLiquidity(state.sim.rewardDilutionLiquidityLast, activeBaseLiquidity(rewardState) || rewardState.stakedLiquidity);
      const totalLiquidity = baseLiquidity + state.sim.liquidityRaw;
      if (totalLiquidity <= 0n) return 0n;
      return state.sim.liquidityRaw * growthDelta * baseLiquidity / totalLiquidity / Q128;
    }

    function accrueAeroRewards(rewardState) {
      const raw = dilutedAeroRaw(rewardState);
      if (raw > 0n) {
        const baseAero = Number(raw) / Number(AERO_DECIMALS);
        const haircut = Math.min(AERO_IMPACT_HAIRCUT_MAX, impactShare(rewardState));
        const conservativeAero = baseAero * (1 - haircut);
        state.sim.aeroBaseUnharvested += baseAero;
        state.sim.aeroHaircutUnharvested += baseAero - conservativeAero;
        state.sim.aeroUnharvested += conservativeAero;
      }
      if (rewardState.rewardInside > state.sim.rewardLast) state.sim.rewardLast = rewardState.rewardInside;
      state.sim.rewardDilutionLiquidityLast = activeBaseLiquidity(rewardState) || rewardState.stakedLiquidity;
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

    function lpFeeTotals(price) {
      return {
        weth: state.sim.lpFeesWeth,
        usdc: state.sim.lpFeesUsdc,
        usdcValue: state.sim.lpFeesWeth * price + state.sim.lpFeesUsdc,
      };
    }

    function accrueLpFees(fees, price) {
      state.sim.lpFeesWeth += fees.weth || 0;
      state.sim.lpFeesUsdc += fees.usdc || 0;
      state.sim.lpFeesUsdcValue = state.sim.lpFeesWeth * price + state.sim.lpFeesUsdc;
      return lpFeeTotals(price);
    }

    function onChainPriceReliability() {
      return 97;
    }

    function estimateRebalanceGasDetails(block, ethUsdcPrice) {
      const l2Eth = Number(REBALANCE_GAS_UNITS * block.baseFeePerGas) / 1e18;
      const l1DataFeeEth = REBALANCE_L1_DATA_FEE_ETH;
      const l2GasFeeUsdc = l2Eth * ethUsdcPrice;
      const l1DataFeeUsdc = l1DataFeeEth * ethUsdcPrice;
      return {
        gasSource: "historical-baseFeePerGas-plus-configured-l1-data-fee",
        gasUsdc: l2GasFeeUsdc + l1DataFeeUsdc,
        l2GasFeeUsdc,
        l1DataFeeUsdc,
        l2GasFeeEth: l2Eth,
        l1DataFeeEth,
        gasReliability: gasEstimateReliability(block),
        gasAssumptions: [
          "L2 execution fee uses historical block baseFeePerGas and configured rebalance gas units.",
          "Base L1 data fee cannot be exactly reconstructed without the real transaction calldata and final L1 pricing fields.",
          "Configured l1DataFeeEth is treated as an estimated historical cost input.",
        ],
      };
    }

    function gasEstimateReliability(block) {
      if (!block || block.baseFeePerGas <= 0n) return 62;
      const l2Eth = Number(REBALANCE_GAS_UNITS * block.baseFeePerGas) / 1e18;
      const l1Share = REBALANCE_L1_DATA_FEE_ETH / Math.max(REBALANCE_L1_DATA_FEE_ETH + l2Eth, Number.EPSILON);
      return scoreFromThresholds(l1Share * 100, [
        [20, 90],
        [40, 84],
        [65, 76],
        [85, 68],
        [100, 60],
      ]);
    }

    function impactRiskDetails(rewardState, aeroPrice, eventAero) {
      const share = impactShare(rewardState);
      const event = eventAero || aeroEventUsdc(aeroPrice);
      return `impact share ${fmtNumber(share * 100, 2)}%; event AERO base ${fmtUsdc(event.base)}; haircut -${fmtUsdc(event.haircut)}`;
    }

    function simulationReliability(row, block, rewardState) {
      const timestamp = Math.floor(new Date(row.time).getTime() / 1000);
      const onChainPrice = priceFromSqrtX96(rewardState.sqrtPriceX96);
      return conservativeReliability([
        { label: "WETH on-chain price", score: onChainPriceReliability(), weight: 0.30 },
        { label: "reward state", score: rewardStateReliability(rewardState), weight: 0.27 },
        { label: "AERO on-chain price", score: state.sim.aeroPriceReliability, weight: 0.20 },
        { label: "block match", score: blockTimeReliability(timestamp, block), weight: 0.17 },
        { label: "CSV cross-check", score: priceAgreementReliability(row.open, onChainPrice), weight: 0.06 },
      ]);
    }

    function rebalanceReliability(rewardState, swapReliability, hasSwap, block) {
      return conservativeReliability([
        { label: "reward state", score: rewardStateReliability(rewardState), weight: 0.27 },
        { label: "AERO on-chain price", score: state.sim.aeroPriceReliability, weight: 0.17 },
        { label: "swap quote", score: hasSwap ? swapReliability : 94, weight: 0.24 },
        { label: "gas estimate", score: gasEstimateReliability(block), weight: 0.18 },
        { label: "automation fee", score: 90, weight: 0.14 },
      ]);
    }

    async function buildSimulationRow(index, eventName, blockOverride = null, runToken = null) {
      const rowStartedAt = performance.now();
      const row = state.rows[index];
      const timestamp = Math.floor(new Date(row.time).getTime() / 1000);
      const previousRow = state.sim.rows.length ? state.sim.rows[state.sim.rows.length - 1] : null;
      const afterBlock = previousRow ? previousRow.blockNumber : 1;
      let phaseStartedAt = performance.now();
      const block = blockOverride || await findBlockAtOrAfter(timestamp, afterBlock);
      rememberSequentialBlockCursor(block);
      recordSimulationTiming("buildSimulationRow.findBlock", phaseStartedAt);
      phaseStartedAt = performance.now();
      const rewardState = await readRewardInside(block.number, state.sim.tickLower, state.sim.tickUpper);
      recordSimulationTiming("buildSimulationRow.readRewardInside", phaseStartedAt);
      phaseStartedAt = performance.now();
      const aeroPrice = await getAeroPrice(block.number);
      recordSimulationTiming("buildSimulationRow.getAeroPrice", phaseStartedAt);
      ensureActiveSimulation(runToken);
      const previousAeroAmounts = {
        conservative: state.sim.aeroUnharvested,
        base: state.sim.aeroBaseUnharvested,
        haircut: state.sim.aeroHaircutUnharvested,
      };
      const previousAeroTotals = aeroTotalsUsdc(aeroPrice);
      accrueAeroRewards(rewardState);
      const aeroTotals = aeroTotalsUsdc(aeroPrice);
      const aeroAmounts = {
        conservative: state.sim.aeroUnharvested - previousAeroAmounts.conservative,
        base: state.sim.aeroBaseUnharvested - previousAeroAmounts.base,
        haircut: state.sim.aeroHaircutUnharvested - previousAeroAmounts.haircut,
        totalConservative: state.sim.aeroUnharvested,
        totalBase: state.sim.aeroBaseUnharvested,
        totalHaircut: state.sim.aeroHaircutUnharvested,
      };
      const aeroEvent = {
        conservative: aeroTotals.conservative - previousAeroTotals.conservative,
        base: aeroTotals.base - previousAeroTotals.base,
        haircut: aeroTotals.haircut - previousAeroTotals.haircut,
      };
      const price = priceFromSqrtX96(rewardState.sqrtPriceX96);
      const previousFeeTotals = lpFeeTotals(price);
      phaseStartedAt = performance.now();
      const lpFeeEstimate = previousRow
        ? await estimateLpFees(previousRow.blockNumber + 1, block.number, rewardState, price)
        : { weth: 0, usdc: 0, usdcValue: 0, source: "initial-row", reliability: 100, swapCount: 0 };
      recordSimulationTiming("buildSimulationRow.estimateLpFees", phaseStartedAt);
      ensureActiveSimulation(runToken);
      const lpFeeTotalsAfter = accrueLpFees(lpFeeEstimate, price);
      const lpFeeEvent = {
        weth: lpFeeTotalsAfter.weth - previousFeeTotals.weth,
        usdc: lpFeeTotalsAfter.usdc - previousFeeTotals.usdc,
        usdcValue: lpFeeTotalsAfter.usdcValue - previousFeeTotals.usdcValue,
      };
      const amounts = amountsForPosition(price);
      const reliability = simulationReliability(row, block, rewardState);
      const result = {
        event: eventName,
        index,
        blockNumber: block.number,
        tick: rewardState.tick,
        value: amounts.value,
        valueWithLpFees: amounts.value + lpFeeTotalsAfter.usdcValue,
        price,
        weth: amounts.weth,
        usdc: amounts.usdc,
        aeroUsdc: aeroEvent.conservative,
        aeroTotalUsdc: aeroTotals.conservative,
        aeroBaseUsdc: aeroEvent.base,
        aeroHaircutUsdc: aeroEvent.haircut,
        aeroAmount: aeroAmounts.conservative,
        aeroTotalAmount: aeroAmounts.totalConservative,
        aeroBaseAmount: aeroAmounts.base,
        aeroHaircutAmount: aeroAmounts.haircut,
        aeroPrice,
        aeroBase: aeroEvent.base,
        aeroConservative: aeroEvent.conservative,
        aeroImpactHaircut: aeroEvent.haircut,
        aeroImpactModel: "counterfactual-conservative-haircut",
        aeroImpactAssumption: `haircut = min(position share, ${fmtNumber(AERO_IMPACT_HAIRCUT_MAX * 100, 2)}%) applied to reconstructed AERO rewards`,
        aeroModel: "conservative-scenario",
        aeroSource: "gauge-rewardInside-reconstructed",
        aeroSourceLabel: "counterfactual-adjusted",
        aeroReliability: state.sim.aeroPriceReliability,
        lpFeesWeth: lpFeeEvent.weth,
        lpFeesUsdc: lpFeeEvent.usdc,
        lpFeesUsdcValue: lpFeeEvent.usdcValue,
        lpFeesTotalUsdc: lpFeeTotalsAfter.usdcValue,
        lpFeesSource: lpFeeEstimate.source,
        lpFeesSourceLabel: lpFeeEstimate.sourceLabel || "counterfactual-adjusted",
        lpFeesReliability: lpFeeEstimate.reliability,
        lpFeesSwapCount: lpFeeEstimate.swapCount,
        lpFeesRangeCrossed: Boolean(lpFeeEstimate.rangeCrossed),
        reliability: reliability.score,
        reliabilityDetails: reliabilityDetailsText(reliability.parts),
        impactDetails: impactRiskDetails(rewardState, aeroPrice, aeroEvent),
        simulationMode: state.sim.lpMode,
        includedRewardStreams: state.sim.lpMode === "staked" ? ["aero"] : ["lpFees"],
        excludedRewardStreams: state.sim.lpMode === "staked" ? ["lpFees"] : ["aero"],
        lpFeesClaimable: state.sim.lpMode === "unstaked",
        aeroClaimable: state.sim.lpMode === "staked",
        totalReturnUsdc: amounts.value + (state.sim.lpMode === "staked" ? aeroTotals.conservative : lpFeeTotalsAfter.usdcValue),
        stateAfter: snapshotState(),
      };
      recordSimulationTiming("buildSimulationRow", rowStartedAt);
      return result;
    }

    async function buildRebalanceRow(index, exit, block, runToken = null) {
      const rowStartedAt = performance.now();
      const previousRow = state.sim.rows.length ? state.sim.rows[state.sim.rows.length - 1] : null;
      const oldTickLower = state.sim.tickLower;
      const oldTickUpper = state.sim.tickUpper;
      const oldSpanTicks = Math.max(AERODROME_TICK_SPACING, oldTickUpper - oldTickLower);
      const exitPrice = priceFromSqrtX96(exit.sqrtPriceX96);
      let phaseStartedAt = performance.now();
      const rewardState = await readRewardInside(block.number, oldTickLower, oldTickUpper);
      recordSimulationTiming("buildRebalanceRow.readOldRewardInside", phaseStartedAt);
      rewardState.rangeCrossed = true;
      phaseStartedAt = performance.now();
      const aeroPrice = await getAeroPrice(block.number);
      recordSimulationTiming("buildRebalanceRow.getAeroPrice", phaseStartedAt);
      ensureActiveSimulation(runToken);
      const previousAeroAmounts = {
        conservative: state.sim.aeroUnharvested,
        base: state.sim.aeroBaseUnharvested,
        haircut: state.sim.aeroHaircutUnharvested,
      };
      accrueAeroRewards(rewardState);
      const aeroTotals = aeroTotalsUsdc(aeroPrice);
      const aeroAmounts = {
        conservative: state.sim.aeroUnharvested - previousAeroAmounts.conservative,
        base: state.sim.aeroBaseUnharvested - previousAeroAmounts.base,
        haircut: state.sim.aeroHaircutUnharvested - previousAeroAmounts.haircut,
        totalConservative: state.sim.aeroUnharvested,
        totalBase: state.sim.aeroBaseUnharvested,
        totalHaircut: state.sim.aeroHaircutUnharvested,
      };
      const aeroEvent = aeroEventUsdc(aeroPrice);
      const harvestedAeroUsdc = aeroTotals.conservative;
      const oldAmounts = amountsForPosition(exitPrice);
      const previousFeeTotals = lpFeeTotals(exitPrice);
      phaseStartedAt = performance.now();
      const lpFeeEstimate = previousRow
        ? await estimateLpFees(previousRow.blockNumber + 1, block.number, rewardState, exitPrice)
        : { weth: 0, usdc: 0, usdcValue: 0, source: "initial-row", reliability: 100, swapCount: 0 };
      recordSimulationTiming("buildRebalanceRow.estimateLpFees", phaseStartedAt);
      ensureActiveSimulation(runToken);
      const lpFeeTotalsAfter = accrueLpFees(lpFeeEstimate, exitPrice);
      const lpFeeEvent = {
        weth: lpFeeTotalsAfter.weth - previousFeeTotals.weth,
        usdc: lpFeeTotalsAfter.usdc - previousFeeTotals.usdc,
        usdcValue: lpFeeTotalsAfter.usdcValue - previousFeeTotals.usdcValue,
      };
      const {
        tickLower: newTickLower,
        tickUpper: newTickUpper,
        anchorTick: newAnchorTick,
      } = tickRangeAroundTick(exit.tick, oldSpanTicks);
      const grossCapital = oldAmounts.value;
      const targetGross = computePositionPlanForRange(grossCapital, exitPrice, newTickLower, newTickUpper, newAnchorTick);
      const excessWeth = oldAmounts.weth - targetGross.weth;
      const excessUsdc = oldAmounts.usdc - targetGross.usdc;
      let swap = { direction: "NONE", amount: 0 };
      if (excessWeth > 0) swap = { direction: "WETH_TO_USDC", amount: excessWeth };
      if (excessUsdc > 0) swap = { direction: "USDC_TO_WETH", amount: excessUsdc };
      phaseStartedAt = performance.now();
      const swapQuote = await estimateHistoricalSwap(swap, exitPrice, block.number);
      recordSimulationTiming("buildRebalanceRow.estimateHistoricalSwap", phaseStartedAt);
      ensureActiveSimulation(runToken);
      const gasDetails = estimateRebalanceGasDetails(block, exitPrice);
      const gasUsdc = gasDetails.gasUsdc;
      const automationFeeUsdc = grossCapital * REBALANCE_MANUAL_FEE_BPS / 10000;
      const totalCostUsdc = swapQuote.lossUsdc + gasUsdc + automationFeeUsdc;
      const netCapital = Math.max(0, grossCapital - totalCostUsdc);
      const newPlan = computePositionPlanForRange(netCapital, exitPrice, newTickLower, newTickUpper, newAnchorTick);
      phaseStartedAt = performance.now();
      const nextRewardState = await readRewardInside(block.number, newTickLower, newTickUpper);
      recordSimulationTiming("buildRebalanceRow.readNewRewardInside", phaseStartedAt);
      ensureActiveSimulation(runToken);
      const reliability = rebalanceReliability(rewardState, swapQuote.reliability, swap.amount > 0, block);
      const impactDetails = impactRiskDetails(rewardState, aeroPrice, aeroEvent);
      state.sim.tickLower = newTickLower;
      state.sim.tickUpper = newTickUpper;
      state.sim.anchorTick = newAnchorTick;
      state.sim.liquidityHuman = newPlan.liquidityHuman;
      state.sim.liquidityRaw = newPlan.liquidityRaw;
      state.sim.rewardStart = nextRewardState.rewardInside;
      state.sim.rewardLast = nextRewardState.rewardInside;
      state.sim.feeGrowthInside0Last = nextRewardState.feeGrowthInside0X128 || state.sim.feeGrowthInside0Last || 0n;
      state.sim.feeGrowthInside1Last = nextRewardState.feeGrowthInside1X128 || state.sim.feeGrowthInside1Last || 0n;
      state.sim.feeDilutionLiquidityLast = activeBaseLiquidity(nextRewardState);
      state.sim.rewardDilutionLiquidityLast = activeBaseLiquidity(nextRewardState) || nextRewardState.stakedLiquidity;
      state.sim.aeroUnharvested = 0;
      state.sim.aeroBaseUnharvested = 0;
      state.sim.aeroHaircutUnharvested = 0;
      state.sim.aeroHarvestedUsdc = harvestedAeroUsdc;
      state.sim.aeroBaseHarvestedUsdc = aeroTotals.base;
      state.sim.aeroHaircutUsdc = aeroTotals.haircut;
      state.sim.lpFeesUsdcValue = lpFeeTotalsAfter.usdcValue;
      const result = {
        event: `rebalance -${fmtUsdc(totalCostUsdc)}`,
        index,
        blockNumber: block.number,
        tick: exit.tick,
        value: newPlan.value,
        valueWithLpFees: newPlan.value + lpFeeTotalsAfter.usdcValue,
        price: exitPrice,
        weth: newPlan.weth,
        usdc: newPlan.usdc,
        aeroUsdc: aeroEvent.conservative,
        aeroTotalUsdc: harvestedAeroUsdc,
        aeroBaseUsdc: aeroEvent.base,
        aeroHaircutUsdc: aeroEvent.haircut,
        aeroAmount: aeroAmounts.conservative,
        aeroTotalAmount: aeroAmounts.totalConservative,
        aeroBaseAmount: aeroAmounts.base,
        aeroHaircutAmount: aeroAmounts.haircut,
        aeroPrice,
        aeroBase: aeroEvent.base,
        aeroConservative: aeroEvent.conservative,
        aeroImpactHaircut: aeroEvent.haircut,
        aeroImpactModel: "counterfactual-conservative-haircut",
        aeroImpactAssumption: `haircut = min(position share, ${fmtNumber(AERO_IMPACT_HAIRCUT_MAX * 100, 2)}%) applied to reconstructed AERO rewards`,
        aeroModel: "conservative-scenario",
        aeroSource: "gauge-rewardInside-reconstructed",
        aeroSourceLabel: "counterfactual-adjusted",
        aeroReliability: state.sim.aeroPriceReliability,
        lpFeesWeth: lpFeeEvent.weth,
        lpFeesUsdc: lpFeeEvent.usdc,
        lpFeesUsdcValue: lpFeeEvent.usdcValue,
        lpFeesTotalUsdc: lpFeeTotalsAfter.usdcValue,
        lpFeesSource: lpFeeEstimate.source,
        lpFeesSourceLabel: lpFeeEstimate.sourceLabel || "counterfactual-adjusted",
        lpFeesReliability: lpFeeEstimate.reliability,
        lpFeesSwapCount: lpFeeEstimate.swapCount,
        lpFeesRangeCrossed: Boolean(lpFeeEstimate.rangeCrossed),
        reliability: reliability.score,
        reliability: reliability.score,
        reliabilityDetails: reliabilityDetailsText(reliability.parts),
        impactDetails,
        simulationMode: state.sim.lpMode,
        includedRewardStreams: state.sim.lpMode === "staked" ? ["aero"] : ["lpFees"],
        excludedRewardStreams: state.sim.lpMode === "staked" ? ["lpFees"] : ["aero"],
        lpFeesClaimable: state.sim.lpMode === "unstaked",
        aeroClaimable: state.sim.lpMode === "staked",
        totalReturnUsdc: newPlan.value + (state.sim.lpMode === "staked" ? harvestedAeroUsdc : lpFeeTotalsAfter.usdcValue),
        stateAfter: snapshotState(),
        rebalance: {
          oldTickLower,
          oldTickUpper,
          newTickLower,
          newTickUpper,
          swapDirection: swap.direction,
          swapSource: swapQuote.source,
          swapSourceLabel: swapQuote.sourceLabel || (swapQuote.source === "fallback" ? "fallback" : "reconstructed-onchain"),
          swapIsFallback: swapQuote.source === "fallback" || swapQuote.source.startsWith("fallback"),
          fallbackSlippageBps: REBALANCE_FALLBACK_SLIPPAGE_BPS,
          quoteFailureReason: swapQuote.failureReason || "",
          quoteAttempts: swapQuote.quoteAttempts || 0,
          swapLossUsdc: swapQuote.lossUsdc,
          gasUsdc,
          gasSource: gasDetails.gasSource,
          l2GasFeeUsdc: gasDetails.l2GasFeeUsdc,
          l1DataFeeUsdc: gasDetails.l1DataFeeUsdc,
          gasReliability: gasDetails.gasReliability,
          gasAssumptions: gasDetails.gasAssumptions,
          gasUnits: Number(REBALANCE_GAS_UNITS),
          l1DataFeeEth: REBALANCE_L1_DATA_FEE_ETH,
          automationFeeUsdc,
          automationFeeBps: REBALANCE_MANUAL_FEE_BPS,
          totalCostUsdc,
          quoteOutputAmount: swapQuote.outputAmount,
          quoteReliability: swapQuote.reliability,
        },
      };
      recordSimulationTiming("buildRebalanceRow", rowStartedAt);
      return result;
    }

    async function stepForward(options = {}) {
      const stepTotalStartedAt = performance.now();
      const shouldRender = options.render !== false;
      if (!state.sim.started || state.sim.stopped || state.sim.stepInProgress) return false;
      const nextIndex = state.sim.currentIndex + 1;
      if (nextIndex > state.sim.endIndex || nextIndex >= state.rows.length) {
        state.sim.stopped = true;
        state.sim.autoRunning = false;
        if (shouldRender) {
          setSimulationNotice({ status: "Симуляция дошла до конца.", details: simulationProgressText(), estimate: "" });
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
        let phaseStartedAt = performance.now();
        const nextBlock = await findSequentialBlockAtOrAfter(nextTimestamp, previous.blockNumber);
        recordSimulationTiming("stepForward.findBlockAtOrAfter", phaseStartedAt);
        const lastExit = state.sim.lastExitBlockNumber > 0
          ? { blockNumber: state.sim.lastExitBlockNumber, logIndex: state.sim.lastExitLogIndex }
          : null;
        phaseStartedAt = performance.now();
        const exit = await findSwapExit(previous.blockNumber, nextBlock.number, state.sim.tickLower, state.sim.tickUpper, lastExit);
        recordSimulationTiming("stepForward.findSwapExit", phaseStartedAt);
        if (runToken !== state.sim.runToken || !state.sim.started) return false;
        state.sim.currentIndex = nextIndex;

        const closePrice = state.rows[nextIndex].close;
        const lowerPrice = priceForTick(state.sim.tickLower);
        const upperPrice = priceForTick(state.sim.tickUpper);
        const exitConfirmed = exit && (closePrice < lowerPrice || closePrice >= upperPrice);
        if (exit && !exitConfirmed) {
          state.sim.lastExitBlockNumber = exit.blockNumber;
          state.sim.lastExitLogIndex = exit.logIndex;
        }

        if (exitConfirmed) {
          phaseStartedAt = performance.now();
          const rebalanceBlock = await getBlock(exit.blockNumber);
          recordSimulationTiming("stepForward.getRebalanceBlock", phaseStartedAt);
          if (runToken !== state.sim.runToken || !state.sim.started) return false;
          phaseStartedAt = performance.now();
          const rebalanceRow = await buildRebalanceRow(nextIndex, exit, rebalanceBlock, runToken);
          recordSimulationTiming("stepForward.buildRebalanceRow", phaseStartedAt);
          if (runToken !== state.sim.runToken || !state.sim.started) return false;
          state.sim.lastExitBlockNumber = exit.blockNumber;
          state.sim.lastExitLogIndex = exit.logIndex;
          rebalanceRow.stateAfter = snapshotState();
          state.sim.rows.push(rebalanceRow);
          state.sim.activeRowIndex = nextIndex;
          state.sim.stopped = false;
          if (shouldRender) setSimulationNotice({ status: "Rebalance рассчитан.", details: simulationProgressText(), estimate: "" });
        } else {
          phaseStartedAt = performance.now();
          const simulationRow = await buildSimulationRow(nextIndex, "price change", nextBlock, runToken);
          recordSimulationTiming("stepForward.buildSimulationRow", phaseStartedAt);
          if (runToken !== state.sim.runToken || !state.sim.started) return false;
          state.sim.rows.push(simulationRow);
          state.sim.activeRowIndex = nextIndex;
          recordSimulationStepDuration(stepStartedAt);
          if (shouldRender) setSimulationNotice({ status: "Свеча рассчитана.", details: simulationProgressText(), estimate: "" });
        }

        if (exitConfirmed) {
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
        recordSimulationTiming("stepForward", stepTotalStartedAt);
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
          if (isServerWorker) {
            recordSimulationTiming("runAutoLoop.workerProgressSkip", performance.now());
            continue;
          }
          let phaseStartedAt = performance.now();
          setSimulationNotice({
            status: "Симуляция считается...",
            details: simulationProgressText(),
            estimate: "",
          });
          recordSimulationTiming("runAutoLoop.setNotice", phaseStartedAt);
          phaseStartedAt = performance.now();
          renderSimulationTable(true);
          recordSimulationTiming("runAutoLoop.renderSimulationTable", phaseStartedAt);
          phaseStartedAt = performance.now();
          await new Promise((resolve) => setTimeout(resolve, 0));
          recordSimulationTiming("runAutoLoop.yield", phaseStartedAt);
        }
      }
      if (runToken === state.sim.runToken && loopId === state.sim.autoLoopId) {
        state.sim.autoRunning = false;
        if (state.sim.currentIndex >= state.sim.endIndex) {
          const phaseStartedAt = performance.now();
          setSimulationNotice({ status: "Симуляция дошла до конца.", details: simulationProgressText(), estimate: "" });
          recordSimulationTiming("runAutoLoop.finalNotice", phaseStartedAt);
        }
        const renderStartedAt = performance.now();
        renderSimulationTable(true);
        recordSimulationTiming("runAutoLoop.finalRenderSimulationTable", renderStartedAt);
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
      buildRebalanceRow,
      findSequentialBlockAtOrAfter,
      resetSequentialBlockCursor,
    };
  }

  const api = { create: createSimulationEngine, createSimulationEngine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.WalletWatchSimulationEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
