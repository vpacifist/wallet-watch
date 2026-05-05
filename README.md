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
```

Для постоянного хранения кеша и статусов между рестартами сервиса подключи Railway Volume в `/data`.
