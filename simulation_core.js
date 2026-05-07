(function initWalletWatchCore(globalScope) {
  function createCore(constants) {
    const {
      MONTHS_SHORT,
      AERODROME_TICK_SPACING,
      PRICE_DECIMAL_FACTOR,
      Q96,
      Q128,
      WETH_DECIMALS,
      USDC_DECIMALS,
      AERO_ADDRESS,
      USDC_ADDRESS,
    } = constants;

    function parseCsv(text) {
      const lines = text.trim().split(/\r?\n/);
      const headers = lines.shift().split(",");
      return lines.map((line, index) => {
        const values = line.split(",");
        const item = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
        return {
          index,
          time: item.time_open,
          closeTime: item.time_close,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume),
        };
      });
    }

    function isoMinute(timestamp) {
      return new Date(timestamp).toISOString().replace(".000Z", "Z");
    }

    function buildCompleteMinuteRows(csvRows) {
      const complete = [];
      let previous = null;
      for (const csvRow of csvRows) {
        const currentTime = new Date(csvRow.time).getTime();
        if (previous) {
          const previousTime = new Date(previous.time).getTime();
          for (let timestamp = previousTime + 60 * 1000; timestamp < currentTime; timestamp += 60 * 1000) {
            const fallbackPrice = Number.isFinite(previous.close) && previous.close > 0 ? previous.close : previous.open;
            complete.push({
              index: complete.length,
              csvIndex: null,
              time: isoMinute(timestamp),
              closeTime: isoMinute(timestamp + 60 * 1000),
              open: fallbackPrice,
              high: fallbackPrice,
              low: fallbackPrice,
              close: fallbackPrice,
              volume: 0,
              missingCandle: true,
              qualityFlags: ["missing-candle"],
            });
          }
        }
        complete.push({
          ...csvRow,
          index: complete.length,
          csvIndex: csvRow.index,
          missingCandle: false,
          qualityFlags: [],
        });
        previous = csvRow;
      }
      return complete;
    }

    function analyzeDataQuality(rows) {
      if (!rows.length) {
        return {
          rowCount: 0,
          gapCount: 0,
          missingMinutes: 0,
          maxGapMinutes: 0,
          duplicateTimestampCount: 0,
          outOfOrderCount: 0,
          invalidPriceCount: 0,
          zeroPriceCount: 0,
          emptyVolumeCount: 0,
          firstTime: "",
          lastTime: "",
        };
      }
      let gapCount = 0;
      let missingMinutes = 0;
      let maxGapMinutes = 0;
      let duplicateTimestampCount = 0;
      let outOfOrderCount = 0;
      let invalidPriceCount = 0;
      let zeroPriceCount = 0;
      let emptyVolumeCount = 0;
      let previous = new Date(rows[0].time).getTime();
      const seen = new Set([rows[0].time]);
      for (const [index, row] of rows.entries()) {
        const prices = [row.open, row.high, row.low, row.close].map(Number);
        if (prices.some((price) => !Number.isFinite(price))) invalidPriceCount += 1;
        else if (prices.some((price) => price <= 0)) zeroPriceCount += 1;
        if (!Number.isFinite(Number(row.volume))) emptyVolumeCount += 1;
        if (index === 0) continue;

        const current = new Date(row.time).getTime();
        if (seen.has(row.time)) duplicateTimestampCount += 1;
        seen.add(row.time);
        const gapMinutes = Math.round((current - previous) / (60 * 1000));
        if (gapMinutes <= 0) {
          outOfOrderCount += 1;
        } else if (gapMinutes > 1) {
          gapCount += 1;
          missingMinutes += gapMinutes - 1;
          if (gapMinutes > maxGapMinutes) maxGapMinutes = gapMinutes;
        }
        previous = current;
      }
      return {
        rowCount: rows.length,
        gapCount,
        missingMinutes,
        maxGapMinutes,
        duplicateTimestampCount,
        outOfOrderCount,
        invalidPriceCount,
        zeroPriceCount,
        emptyVolumeCount,
        firstTime: rows[0].time,
        lastTime: rows[rows.length - 1].time,
      };
    }

    function fmtPrice(value) {
      return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function fmtNumber(value, digits = 6) {
      return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function fmtUsdc(value) {
      return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function fmtReliability(value) {
      return `${fmtNumber(value, 2)}%`;
    }

    function fmtDeposit(value) {
      const number = Math.round(Number(value || 0));
      return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    }

    function fmtPercent(value) {
      return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
    }

    function parseNumericInput(value) {
      return Number(String(value).replace(/'/g, "").replace(/\s/g, "").replace(/,/g, "."));
    }

    function parseRangePercent(value) {
      return parseNumericInput(String(value).replace(/%/g, ""));
    }

    function fmtTime(value) {
      const date = new Date(value);
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hours}:${minutes}`;
    }

    function fmtInputTime(value) {
      const date = new Date(value);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
    }

    function parseInputTime(value) {
      const trimmed = value.trim();
      if (!trimmed) return Number.NaN;
      const isoLike = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
      const normalized = isoLike.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(isoLike) ? isoLike : `${isoLike}Z`;
      const timestamp = Date.parse(normalized);
      return Number.isNaN(timestamp) ? Number.NaN : timestamp;
    }

    function fmtAxisTime(value) {
      const date = new Date(value);
      const day = String(date.getUTCDate()).padStart(2, "0");
      return `${day} ${MONTHS_SHORT[date.getUTCMonth()]}`;
    }

    function fmtAxisHour(value) {
      const date = new Date(value);
      return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
    }

    function startOfUtcDay(date) {
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    }

    function addUtcDays(timestamp, days) {
      return timestamp + days * 24 * 60 * 60 * 1000;
    }

    function addUtcHours(timestamp, hours) {
      return timestamp + hours * 60 * 60 * 1000;
    }

    function priceBounds(rows) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const row of rows) {
        if (row.low < min) min = row.low;
        if (row.high > max) max = row.high;
      }
      return { min, max };
    }

    function tickForPrice(price) {
      return Math.log(price / PRICE_DECIMAL_FACTOR) / Math.log(1.0001);
    }

    function priceForTick(tick) {
      return Math.pow(1.0001, tick) * PRICE_DECIMAL_FACTOR;
    }

    function sqrtPriceX96ForPrice(price) {
      return BigInt(Math.floor(Math.sqrt(price / PRICE_DECIMAL_FACTOR) * Number(Q96)));
    }

    function encodeInt24(value) {
      const modulo = 1n << 256n;
      let encoded = BigInt(value);
      if (encoded < 0n) encoded = modulo + encoded;
      return encoded.toString(16).padStart(64, "0");
    }

    function encodeUint256(value) {
      return BigInt(value).toString(16).padStart(64, "0");
    }

    function encodeAddress(address) {
      return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    }

    function toSignedWord(hex) {
      let value = BigInt(`0x${hex}`);
      if (value >= (1n << 255n)) value -= 1n << 256n;
      return value;
    }

    function hexToBigInt(hex) {
      if (!hex || hex === "0x") return 0n;
      return BigInt(hex);
    }

    function wordAt(data, index) {
      const clean = data.startsWith("0x") ? data.slice(2) : data;
      return clean.slice(index * 64, (index + 1) * 64).padStart(64, "0");
    }

    function addressFromWord(data, index = 0) {
      return `0x${wordAt(data, index).slice(24)}`.toLowerCase();
    }

    function blockTag(blockNumber) {
      return `0x${blockNumber.toString(16)}`;
    }

    function aeroUsdcPriceFromSqrtX96(sqrtPriceX96, tokenOrder) {
      const ratio = (Number(sqrtPriceX96) / Number(Q96)) ** 2;
      const aero = AERO_ADDRESS.toLowerCase();
      const usdc = USDC_ADDRESS.toLowerCase();
      if (tokenOrder.token0 === aero && tokenOrder.token1 === usdc) return ratio * 1e12;
      if (tokenOrder.token0 === usdc && tokenOrder.token1 === aero) return 1 / (ratio * 1e-12);
      throw new Error("AERO/USDC pool token order mismatch");
    }

    function rangeSpanTicksForWidth(rangeWidth) {
      const rawSpan = Math.log1p(rangeWidth) / Math.log(1.0001);
      return Math.max(
        AERODROME_TICK_SPACING,
        Math.round(rawSpan / AERODROME_TICK_SPACING) * AERODROME_TICK_SPACING,
      );
    }

    function tickRangeAroundTick(tick, spanTicks) {
      const span = Math.max(
        AERODROME_TICK_SPACING,
        Math.round(spanTicks / AERODROME_TICK_SPACING) * AERODROME_TICK_SPACING,
      );
      let tickLower = Math.floor((tick - span / 2) / AERODROME_TICK_SPACING) * AERODROME_TICK_SPACING;
      let tickUpper = tickLower + span;
      while (tick < tickLower) {
        tickLower -= AERODROME_TICK_SPACING;
        tickUpper -= AERODROME_TICK_SPACING;
      }
      while (tick >= tickUpper) {
        tickLower += AERODROME_TICK_SPACING;
        tickUpper += AERODROME_TICK_SPACING;
      }
      const anchorTick = Math.floor(tick / AERODROME_TICK_SPACING) * AERODROME_TICK_SPACING;
      return { tickLower, tickUpper, anchorTick };
    }

    function computePositionPlan(depositUsdc, price, rangeWidth) {
      const spanTicks = rangeSpanTicksForWidth(rangeWidth);
      const { tickLower, tickUpper, anchorTick } = tickRangeAroundTick(tickForPrice(price), spanTicks);
      return computePositionPlanForRange(depositUsdc, price, tickLower, tickUpper, anchorTick);
    }

    function computePositionPlanForRange(depositUsdc, price, tickLower, tickUpper, anchorTick) {
      const sqrtA = Math.sqrt(priceForTick(tickLower));
      const sqrtB = Math.sqrt(priceForTick(tickUpper));
      const sqrtP = Math.sqrt(price);
      const valuePerLiquidity = price * (sqrtB - sqrtP) / (sqrtP * sqrtB) + (sqrtP - sqrtA);
      const liquidityHuman = depositUsdc / valuePerLiquidity;
      const weth = liquidityHuman * (sqrtB - sqrtP) / (sqrtP * sqrtB);
      const usdc = liquidityHuman * (sqrtP - sqrtA);
      const sqrtPX96 = sqrtPriceX96ForPrice(price);
      const sqrtAX96 = sqrtPriceX96ForPrice(priceForTick(tickLower));
      const sqrtBX96 = sqrtPriceX96ForPrice(priceForTick(tickUpper));
      const amount0 = BigInt(Math.max(0, Math.floor(weth * Number(WETH_DECIMALS))));
      const amount1 = BigInt(Math.max(0, Math.floor(usdc * Number(USDC_DECIMALS))));
      const liq0 = amount0 * sqrtPX96 * sqrtBX96 / Q96 / (sqrtBX96 - sqrtPX96);
      const liq1 = amount1 * Q96 / (sqrtPX96 - sqrtAX96);
      return {
        tickLower,
        tickUpper,
        anchorTick,
        liquidityHuman,
        liquidityRaw: liq0 < liq1 ? liq0 : liq1,
        weth,
        usdc,
        value: weth * price + usdc,
      };
    }

    function priceFromSqrtX96(sqrtPriceX96) {
      const sqrt = Number(sqrtPriceX96) / Number(Q96);
      return sqrt * sqrt * PRICE_DECIMAL_FACTOR;
    }

    function rawWeth(amount) {
      return BigInt(Math.max(0, Math.floor(amount * Number(WETH_DECIMALS))));
    }

    function rawUsdc(amount) {
      return BigInt(Math.max(0, Math.floor(amount * Number(USDC_DECIMALS))));
    }

    function rawToWeth(raw) {
      return Number(raw) / Number(WETH_DECIMALS);
    }

    function rawToUsdc(raw) {
      return Number(raw) / Number(USDC_DECIMALS);
    }

    function clampPercent(value) {
      return Math.max(0, Math.min(100, Number(value) || 0));
    }

    function scoreFromThresholds(value, thresholds) {
      if (value <= thresholds[0][0]) return thresholds[0][1];
      for (let index = 1; index < thresholds.length; index += 1) {
        const [limit, score] = thresholds[index];
        const [previousLimit, previousScore] = thresholds[index - 1];
        if (value <= limit) {
          const ratio = (value - previousLimit) / (limit - previousLimit);
          return previousScore + (score - previousScore) * ratio;
        }
      }
      return thresholds[thresholds.length - 1][1];
    }

    function conservativeReliability(factors) {
      const usable = factors.filter((factor) => Number.isFinite(factor.score) && factor.weight > 0);
      if (!usable.length) return { score: 0, parts: [] };
      const totalWeight = usable.reduce((sum, factor) => sum + factor.weight, 0);
      const weighted = usable.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight;
      const floor = Math.min(...usable.map((factor) => factor.score));
      return {
        score: clampPercent(Math.min(96, weighted, floor + 18)),
        parts: usable,
      };
    }

    function reliabilityDetailsText(parts) {
      return parts.map((part) => `${part.label} ${fmtReliability(part.score)}`).join("; ");
    }

    function blockTimeReliability(timestampSeconds, block) {
      const deltaSeconds = Math.abs(block.timestamp - timestampSeconds);
      return scoreFromThresholds(deltaSeconds, [
        [2, 98],
        [12, 95],
        [60, 84],
        [180, 68],
        [600, 45],
      ]);
    }

    function priceAgreementReliability(csvPrice, onChainPrice) {
      if (!Number.isFinite(csvPrice) || csvPrice <= 0 || !Number.isFinite(onChainPrice) || onChainPrice <= 0) return 0;
      const errorBps = Math.abs(csvPrice / onChainPrice - 1) * 10000;
      return scoreFromThresholds(errorBps, [
        [2, 97],
        [10, 93],
        [50, 82],
        [100, 66],
        [250, 35],
      ]);
    }

    function rewardStateReliability(rewardState) {
      const reserveWeeks = Number(rewardState.rewardReserve) / Number(rewardState.rewardRate || 1n) / (7 * 24 * 60 * 60);
      let score = scoreFromThresholds(reserveWeeks, [
        [0.05, 35],
        [0.25, 58],
        [0.75, 78],
        [2, 90],
        [8, 96],
      ]);
      if (rewardState.rewardReserveCapped) score = Math.min(score, 72);
      if (rewardState.rewardRate <= 0n || rewardState.stakedLiquidity <= 0n) score = 0;
      return score;
    }

    function aeroPriceReliability(ageSeconds) {
      return scoreFromThresholds(ageSeconds, [
        [60, 92],
        [10 * 60, 82],
        [60 * 60, 64],
        [6 * 60 * 60, 42],
        [24 * 60 * 60, 18],
      ]);
    }

    return {
      parseCsv,
      buildCompleteMinuteRows,
      analyzeDataQuality,
      fmtPrice,
      fmtNumber,
      fmtUsdc,
      fmtReliability,
      fmtDeposit,
      fmtPercent,
      parseNumericInput,
      parseRangePercent,
      fmtTime,
      fmtInputTime,
      parseInputTime,
      fmtAxisTime,
      fmtAxisHour,
      startOfUtcDay,
      addUtcDays,
      addUtcHours,
      priceBounds,
      tickForPrice,
      priceForTick,
      sqrtPriceX96ForPrice,
      encodeInt24,
      encodeUint256,
      encodeAddress,
      toSignedWord,
      hexToBigInt,
      wordAt,
      addressFromWord,
      blockTag,
      aeroUsdcPriceFromSqrtX96,
      rangeSpanTicksForWidth,
      tickRangeAroundTick,
      computePositionPlan,
      computePositionPlanForRange,
      priceFromSqrtX96,
      rawWeth,
      rawUsdc,
      rawToWeth,
      rawToUsdc,
      clampPercent,
      scoreFromThresholds,
      conservativeReliability,
      reliabilityDetailsText,
      blockTimeReliability,
      priceAgreementReliability,
      rewardStateReliability,
      aeroPriceReliability,
    };
  }

  const api = { create: createCore, createCore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.WalletWatchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
