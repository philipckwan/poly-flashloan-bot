import { config as dotEnvConfig } from "dotenv";
let argEnv = process.argv[2] ? process.argv[2] : "";
dotEnvConfig({ path: `${argEnv}.env` });
import { checkArbitrage } from "./price/1inch";
import {
  swapPairList,
  interval,
  loanAmount,
  diffAmount,
  explorerURL,
  gasLimit,
  apiGetGasPrice,
  gasPrice,
  gasPriceLimit,
  gasPriceMultiplier,
} from "./config";
import { flashloan } from "./flashloan";
import { expectAmountOut } from "./expect";
import { getBigNumber, formatDate } from "./utils";
import { ethers } from "ethers";
import { createRoutes } from "./price/1inch/route";
import * as log4js from "log4js";

const devLogger = log4js.getLogger("develop");
const logger = log4js.getLogger("flashloan");
const errReport = log4js.getLogger("error");

const init = () => {
  let devLoggerLevel = process.env.DEV_LOGGER_LEVEL
    ? process.env.DEV_LOGGER_LEVEL
    : "debug";
  let loggerFilepath = process.env.LOGGER_FILEPATH
    ? process.env.LOGGER_FILEPATH
    : "log/";
  let loggerFilePrefix = process.env.LOGGER_FILE_PREFIX
    ? process.env.LOGGER_FILE_PREFIX
    : "";

  log4js.configure({
    appenders: {
      dev: {
        type: "file",
        filename: `${loggerFilepath}${loggerFilePrefix}dev.log`,
      },
      flashloan: {
        type: "file",
        filename: `${loggerFilepath}${loggerFilePrefix}flashloan.log`,
      },
      error: {
        type: "file",
        filename: `${loggerFilepath}${loggerFilePrefix}error.log`,
      },
    },
    categories: {
      develop: { appenders: ["dev"], level: devLoggerLevel },
      default: { appenders: ["flashloan"], level: "info" },
      error: { appenders: ["error"], level: "warn" },
    },
  });
};

export const main = async () => {
  init();

  console.clear();

  let msg = `poly-flashloan-bot.index.main: v1.12; process.env.LOGGER_FILE_PREFIX:${process.env.LOGGER_FILE_PREFIX}; apiGetGasPrice:${apiGetGasPrice};`;
  devLogger.debug(msg);
  console.log(msg);
  msg = `__gasPrice:${gasPrice};loanAmount:${loanAmount};gasPriceMultiplier:${gasPriceMultiplier};gasPriceLimit:${gasPriceLimit};`;
  devLogger.debug(msg);
  console.log(msg);

  let isFlashLoaning = false;

  swapPairList.forEach(async (aSwapPair) => {
    let baseToken = aSwapPair.fromToken;
    let tradingToken = aSwapPair.toToken;
    // prevent swapping the same pair
    if (baseToken.address != tradingToken.address) {
      let isCheckingOpportunity = false;
      // await delay(interval / (baseTokens.length * tradingTokens.length) * i)
      const func = async () => {
        while (isCheckingOpportunity) {
          devLogger.debug(
            `index.main: [${baseToken.symbol}-${tradingToken.symbol}], skipping isProfit checking until isCheckingOpportunity returns false...`
          );
          return;
        }

        const [isProfitable, firstProtocols, secondProtocols] =
          await checkArbitrage(baseToken, tradingToken);

        devLogger.debug(
          `index.main: [${baseToken.symbol}-${tradingToken.symbol}], isProfitable:${isProfitable};`
        );

        if (isProfitable && !isFlashLoaning && !isCheckingOpportunity) {
          if (firstProtocols && secondProtocols) {
            isCheckingOpportunity = true;
            // generate a random number to be used as an identifier
            let idOpCheck = Math.floor(Math.random() * 10000);
            devLogger.debug(
              `index.main: [${baseToken.symbol}-${tradingToken.symbol}#${idOpCheck}], will check for isOpportunity;`
            );
            const firstRoutes = createRoutes(firstProtocols);
            const secondRoutes = createRoutes(secondProtocols);

            const bnLoanAmount = getBigNumber(loanAmount, baseToken.decimals);
            let bnExpectedAmountOut = getBigNumber(0);
            // double check the price by qeurying dex contracts
            let startTime = Date.now();
            try {
              bnExpectedAmountOut = await expectAmountOut(
                firstRoutes,
                bnLoanAmount
              ).then((firstAmountOut) =>
                expectAmountOut(secondRoutes, firstAmountOut)
              );
            } catch (e) {
              // skip flashloan when failed to estimate price
              errReport.warn(e);
              errReport.warn(1, JSON.stringify(firstProtocols));
              errReport.warn(2, JSON.stringify(secondProtocols));
              return;
            }
            let endTime = Date.now();
            let timeDiff = (endTime - startTime) / 1000;
            // check if the expected amount is larger than the loan amount
            const isOpportunity = bnLoanAmount
              .add(getBigNumber(diffAmount, baseToken.decimals))
              .lt(bnExpectedAmountOut);
            let bnLoanAmountAddDiff = bnLoanAmount.add(
              getBigNumber(diffAmount, baseToken.decimals)
            );
            devLogger.debug(
              `index.main: [${baseToken.symbol}-${
                tradingToken.symbol
              }#${idOpCheck}]; isOpportunity:${isOpportunity}; bnExpectedAmountOut:${bnExpectedAmountOut}; start:${formatDate(
                startTime
              )}; end:${formatDate(endTime)}; duration:${timeDiff.toFixed(3)};`
            );

            if (isOpportunity) {
              isFlashLoaning = true;
              const stDifference = Number(
                ethers.utils.formatUnits(
                  bnExpectedAmountOut.sub(bnLoanAmount),
                  baseToken.decimals
                )
              ).toFixed(2);
              const amount = Number(
                ethers.utils.formatUnits(
                  bnExpectedAmountOut,
                  baseToken.decimals
                )
              ).toFixed(2);
              const difference = Number(stDifference);
              const percentage = (difference / Number(loanAmount)) * 100;

              try {
                devLogger.debug(
                  `index.main: [${baseToken.symbol}-${tradingToken.symbol}#${idOpCheck}] about to flashloan`
                );
                const tx = await flashloan(
                  baseToken,
                  firstRoutes,
                  secondRoutes,
                  idOpCheck
                );
                devLogger.debug(
                  `index.main: [${baseToken.symbol}-${tradingToken.symbol}#${idOpCheck}] done flashloan; tx:${tx.hash}; difference:${difference}; percentage:${percentage};`
                );
                logger.info("flashloan executed", tx.hash);
                logger.info(`Explorer URL: ${explorerURL}/tx/${tx.hash}`);
              } catch (e) {
                devLogger.error(
                  `index.main: ERROR - in flashloan execution; [${baseToken.symbol}-${tradingToken.symbol}#${idOpCheck}];`
                );
                errReport.error(e);
                errReport.error({
                  gasLimit,
                  gasPrice,
                  loanAmount,
                  baseToken,
                  tradingToken,
                });
              } finally {
                isFlashLoaning = false;
              }
            }
            isCheckingOpportunity = false;
          }
        }
      };

      func();
      setInterval(func, interval);
    }
  });
};

main().catch((error) => {
  console.error(error);
  errReport.error(error);
  process.exit(1);
});
