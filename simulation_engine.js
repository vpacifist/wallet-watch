(function initWalletWatchSimulationEngine(globalScope) {
  function createSimulationEngine(deps) {
    const {
      state,
      performance,
      findBlockAtOrAfter,
      findSwapExit,
      getBlock,
      buildRebalanceRow,
      buildSimulationRow,
      recordSimulationStepDuration,
      simulationProgressText,
      setSimulationNotice,
      renderSimulationTable,
      updateSimulationControls,
    } = deps;

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
    };
  }

  const api = { create: createSimulationEngine, createSimulationEngine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.WalletWatchSimulationEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
