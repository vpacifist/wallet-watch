# Wallet Watch

Веб-инструмент для симуляции WETH/USDC Aerodrome позиции на исторических минутных данных.

## Локальный запуск

```bash
python scripts/serve_with_rpc.py
```

Открой:

```text
http://127.0.0.1:8003/index.html
```

По умолчанию кнопка `START` запускает серверную simulation job через `/api/simulations`. Сам расчет выполняется на сервере в Node worker, поэтому вкладку браузера можно закрыть, а позже открыть страницу снова и увидеть последний статус.

Для старого локального режима расчета в браузере открой:

```text
http://127.0.0.1:8003/index.html?local-sim=1
```

## Проверки

```bash
npm test
```

Тесты запускают серверный simulation runtime на коротких фиксированных диапазонах и сверяют итоговые значения.

## Достоверность расчетов

Симуляция использует CSV как минутную сетку и визуальный слой для графика. Если в CSV есть пропущенные минуты, приложение достраивает полную минутную сетку и помечает такие строки как `missing-candle`. Экономические расчеты для строки берут historical on-chain state через Base RPC: блок, `slot0`, reward state и swap logs.

Важно различать типы данных:

- `on-chain`: цена WETH/USDC из `slot0`, исторический блок, tick, reward state.
- `estimated`: LP trading fees, gas ребаланса, fallback swap loss.
- `conservative`: AERO после haircut на влияние собственной ликвидности.

Итоговые серверные результаты сохраняются как raw numeric rows (`rawRows`), а не только как отформатированные строки таблицы. Это нужно, чтобы результаты можно было проверять и сравнивать программно.

## Railway

Railway стартует приложение командой:

```bash
python scripts/serve_with_rpc.py
```

Сервер слушает `0.0.0.0:$PORT`, если Railway задает переменную `PORT`.

Рекомендуемые переменные окружения:

```text
PUBLIC_BASE_URL=https://your-railway-domain.up.railway.app
MARKET_DATA_PATH=/data/market_data.sqlite
SIM_DATA_PATH=/data/simulations.sqlite
BASE_RPC_URLS=https://base.drpc.org,https://base.gateway.tenderly.co,https://mainnet.base.org,https://base.llamarpc.com
REBALANCE_MANUAL_FEE_BPS=1
REBALANCE_GAS_UNITS=1450000
REBALANCE_L1_DATA_FEE_ETH=0.000012
REBALANCE_FALLBACK_SLIPPAGE_BPS=5
LP_FEE_RATE=0.0005
```

Для постоянного хранения кеша и статусов между рестартами сервиса подключи Railway Volume в `/data`.

Если деплой публичный, можно задать `ADMIN_API_TOKEN`. Тогда создание, отмена и удаление симуляций потребуют токен. В браузере при первом 401 приложение попросит токен и сохранит его в `localStorage`. Не коммить реальные токены и приватные RPC URL в репозиторий.

Для проверки приватных RPC под исторические симуляции есть локальный benchmark:

```bash
BASE_RPC_URLS="https://provider-1.example/...,https://provider-2.example/..." python scripts/check_base_rpc.py
```

Скрипт проверяет `eth_getBlockByNumber`, исторический `eth_call`, batch-запрос и `eth_getLogs` на Base. В выводе URL редактируются, но реальные RPC URL все равно держи только в `.env`, локальном окружении или Railway Environment Variables.
