const { runSimulation } = require("./simulation_runtime");

const config = JSON.parse(process.env.SERVER_SIM_CONFIG || "{}");

function emit(payload) {
  console.log(JSON.stringify(payload));
}

runSimulation(config, emit)
  .then((result) => {
    process.exit(result.exitCode);
  })
  .catch((error) => {
    emit({
      type: "result",
      id: config.id,
      status: "error",
      message: error && error.message ? error.message : String(error),
    });
    process.exit(4);
  });
