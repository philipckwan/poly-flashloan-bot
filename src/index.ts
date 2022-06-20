import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import {
  interval,
  renderInterval,
  explorerURL,
  gasLimit,
  tradingRoutes,
  diffPercentage,
  flashloanAddress,
} from "./config";
import { flashloan } from "./flashloan";
import { checkIfProfitable, getBigNumber } from "./utils";
import { ethers } from "ethers";
// import { chalkDifference, chalkPercentage, chalkTime } from "./utils/chalk";
import { flashloanTable, priceTable } from "./consoleUI/table";
// import { initPriceTable, renderTables } from "./consoleUI";
import * as log4js from "log4js";
import { findOpp } from "./findOpp";
import { uniswapRouter } from "./constants/addresses";

log4js.configure({
  appenders: {
    dev: { type: "file", filename: "log/dev.log" },
    flashloan: { type: "file", filename: "log/flashloan.log" },
    error: { type: "file", filename: "log/error.log" },
  },
  categories: {
    develop: { appenders: ["dev"], level: "debug" },
    default: { appenders: ["flashloan"], level: "info" },
    error: { appenders: ["error"], level: "warn" },
  },
});

const devLogger = log4js.getLogger("develop");
const logger = log4js.getLogger("flashloan");
const errReport = log4js.getLogger("error");

export const main = async () => {
  let isFlashLoaning = false;
  let msg = `poly-flashloan-bot.index.main: v3.5; flashloanAddress:${flashloanAddress};`;
  console.log(msg);
  devLogger.debug(msg);
  tradingRoutes.forEach(async (trade) => {
    const baseToken = trade.path[0];

    const func = async () => {
      const bnLoanAmount = trade.amountIn;
      // estimate the token amount you get atfer swaps
      let [bnExpectedAmountOut, bnAmountOuts] = await findOpp(trade);
      const isProfitable = checkIfProfitable(
        bnLoanAmount,
        diffPercentage,
        bnExpectedAmountOut
      );
      devLogger.debug(
        `index.main: isOpp:${isProfitable}; bnExpectedAmountOut: ${bnExpectedAmountOut};`
      );

      if (isProfitable && !isFlashLoaning) {
        isFlashLoaning = true;
        try {
          const tx = await flashloan(trade);
          const stDifference = Number(
            ethers.utils.formatUnits(
              bnExpectedAmountOut.sub(bnLoanAmount),
              baseToken.decimals
            )
          ).toFixed(4);
          const amount = Number(
            ethers.utils.formatUnits(bnExpectedAmountOut, baseToken.decimals)
          ).toFixed(4);
          const loanAmount = Number(
            ethers.utils.formatUnits(bnLoanAmount, baseToken.decimals)
          );
          const difference = Number(stDifference);
          const percentage = Number(
            ((difference / loanAmount) * 100).toFixed(2)
          );
          const path = trade.path.map((token) => {
            return token.symbol;
          });
          devLogger.debug(`index.main: flashloan executed; tx:${tx.hash}`);
          logger.info("path", path, "protocols", trade.protocols);
          logger.info({ amount, difference, percentage });
          logger.info(`Explorer URL: ${explorerURL}/tx/${tx.hash}`);
        } catch (e) {
          devLogger.error(`index.main: ERROR - flashloan execution error;`);
          errReport.error(e);
        } finally {
          let amountIn = Number(
            ethers.utils.formatUnits(trade.amountIn, trade.path[0].decimals)
          );
          let amountOut0 = Number(
            ethers.utils.formatUnits(bnAmountOuts[0], trade.path[1].decimals)
          );
          let rate0 = amountOut0 / amountIn;
          let amountOut1 = Number(
            ethers.utils.formatUnits(bnAmountOuts[1], trade.path[0].decimals)
          );
          let rate1 = amountOut1 / amountOut0;
          let finalRate = rate0 * rate1;
          let routerName0 = Object.keys(uniswapRouter)[trade.protocols[0]];
          let routerName1 = Object.keys(uniswapRouter)[trade.protocols[1]];
          let msg = `index.main: [${trade.path[0].symbol}-${
            trade.path[1].symbol
          }]:[${routerName0}:${rate0.toFixed(
            5
          )}]->[${routerName1}:${rate1.toFixed(5)}]; final%:${finalRate.toFixed(
            4
          )};`;
          devLogger.debug(msg);
          isFlashLoaning = false;
        }
      }
    };

    func();
    setInterval(func, interval);
  });
};

main().catch((error) => {
  console.error(error);
  errReport.error(error);
  process.exit(1);
});
