import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { checkArbitrage } from "./price/1inch";
import {
  baseTokens,
  interval,
  tradingTokens,
  renderInterval,
  loanAmount,
  diffAmount,
  explorerURL,
  gasLimit,
  gasPrice,
} from "./config";
import { flashloan } from "./flashloan";
import { expectAmountOut } from "./expect";
import { getBigNumber } from "./utils";
import { ethers } from "ethers";
import { chalkDifference, chalkPercentage, chalkTime } from "./utils/chalk";
import { flashloanTable, priceTable } from "./consoleUI/table";
import { initPriceTable, renderTables } from "./consoleUI";
import { createRoutes } from "./price/1inch/route";
import * as log4js from "log4js";

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
  devLogger.debug(`index.main: v1.2;`);

  console.clear();

  let isFlashLoaning = false;

  const [maxX, _] = process.stdout.getWindowSize();

  const p = priceTable(maxX);
  const pp = flashloanTable(maxX);

  let idx = 0;
  initPriceTable(p, idx);

  idx = 0;
  renderTables(p, pp);
  // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  setInterval(() => {
    renderTables(p, pp);
  }, renderInterval);

  baseTokens.forEach(async (baseToken) => {
    tradingTokens.forEach(async (tradingToken) => {
      // prevent swapping the same pair
      if (baseToken.address > tradingToken.address) {
        const i = idx;

        // await delay(interval / (baseTokens.length * tradingTokens.length) * i)

        const func = async () => {
          const startTime = Date.now();

          const updateRow = (text: any, options?: any) => {
            text.time = chalkTime((Date.now() - startTime) / 1000).padStart(6);
            text.timestamp = new Date().toISOString();

            p.table.createColumnFromRow(text);
            p.table.rows[i] = {
              color: options?.color || p.table.rows[i].color,
              separator:
                options?.separator !== undefined
                  ? options?.separator
                  : p.table.rows[i].separator,
              text: { ...p.table.rows[i].text, ...text },
            };
          };

          const [isProfitable, firstProtocols, secondProtocols] =
            await checkArbitrage(baseToken, tradingToken, updateRow);

          renderTables(p, pp);

          devLogger.debug(
            `index.main: [${baseToken.symbol}] -> [${tradingToken.symbol}], isProfitable:${isProfitable};`
          );
          if (isProfitable && !isFlashLoaning) {
            if (firstProtocols && secondProtocols) {
              devLogger.debug(
                `index.main: [${baseToken.symbol}] -> [${tradingToken.symbol}], will check for isOpportunity;`
              );
              const firstRoutes = createRoutes(firstProtocols);
              const secondRoutes = createRoutes(secondProtocols);

              const bnLoanAmount = getBigNumber(loanAmount, baseToken.decimals);
              let bnExpectedAmountOut = getBigNumber(0);
              // double check the price by qeurying dex contracts
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
              // check if the expected amount is larger than the loan amount
              const isOpportunity = bnLoanAmount
                .add(getBigNumber(diffAmount, baseToken.decimals))
                .lt(bnExpectedAmountOut);
              let bnLoanAmountAddDiff = bnLoanAmount.add(
                getBigNumber(diffAmount, baseToken.decimals)
              );
              devLogger.debug(
                `__isOpportunity:${isOpportunity}; bnLoanAmountAddDiff:${bnLoanAmountAddDiff}; bnExpectedAmountOut:${bnExpectedAmountOut};`
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

                const startTime = Date.now();

                try {
                  devLogger.debug(`index.main: about to flashloan`);
                  const tx = await flashloan(
                    baseToken,
                    firstRoutes,
                    secondRoutes
                  );
                  devLogger.debug(`index.main: done flashloan`);
                  pp.addRow({
                    baseToken: baseToken.symbol.padEnd(6),
                    tradingToken: tradingToken.symbol.padEnd(6),

                    amount: (amount || "").padStart(7),
                    difference: (chalkDifference(difference) || "").padStart(6),
                    percentage: (chalkPercentage(percentage) || "").padStart(4),

                    firstRoutes: firstProtocols.map((routes) =>
                      routes.map((hops) =>
                        hops
                          .map((swap) => swap.name.replace("POLYGON_", ""))
                          .join(" → ")
                      )
                    ),
                    secondRoutes: secondProtocols.map((routes) =>
                      routes.map((hops) =>
                        hops
                          .map((swap) => swap.name.replace("POLYGON_", ""))
                          .join(" → ")
                      )
                    ),

                    txHash: tx.hash.padStart(66),

                    time: chalkTime((Date.now() - startTime) / 1000).padStart(
                      6
                    ),
                    timestamp: new Date().toISOString(),
                  });
                  renderTables(p, pp);
                  logger.info("flashloan executed", tx.hash);
                  logger.info(`Explorer URL: ${explorerURL}/tx/${tx.hash}`);
                } catch (e) {
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
            }
          }
        };

        func();

        setInterval(func, interval);

        idx++;
      }
    });
  });
};

main().catch((error) => {
  console.error(error);
  errReport.error(error);
  process.exit(1);
});
