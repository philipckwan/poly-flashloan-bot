import { ethers } from "ethers";
import { chainId, diffAmount, loanAmount } from "../../config";
import { IRoute } from "../../interfaces/main";
import { ERC20Token, IToken } from "../../constants/addresses";
import { replaceTokenAddress, formatDate } from "../../utils";
import { IProtocol } from "../../interfaces/inch";
import { sendRequest } from "../../utils/request";
import { get1inchQuoteCallUrl } from "./url";
import * as log4js from "log4js";

const devLogger = log4js.getLogger("develop");
/**
 * Will check if there's an arbitrage opportunity using the 1inch API
 * @param fromToken token symbol you're swapping from
 * @param toToken token symbol you're swapping to
 * @param fromTokenDecimal number of decimal places of the token you're swapping from
 * @returns
 */
export async function checkArbitrage(
  fromToken: IToken,
  toToken: IToken
): Promise<[boolean, IProtocol[][][] | null, IProtocol[][][] | null, string?]> {
  let startTime = Date.now();

  const fromTokenDecimal = fromToken.decimals;

  const amount = ethers.utils.parseUnits(
    loanAmount.toString(),
    fromTokenDecimal
  );
  const amountDiff = ethers.utils.parseUnits(
    (loanAmount + diffAmount).toString(),
    fromTokenDecimal
  );

  const firstCallURL = get1inchQuoteCallUrl(
    chainId,
    fromToken.address,
    toToken.address,
    amount
  );

  const resultData1 = await sendRequest(firstCallURL);
  if (!resultData1.data) {
    return [false, null, null];
  }

  const firstProtocols = resultData1.data.protocols;
  const returnAmount = resultData1.data.toTokenAmount;
  const secondCallURL = get1inchQuoteCallUrl(
    chainId,
    toToken.address,
    fromToken.address,
    returnAmount
  );

  const resultData2 = await sendRequest(secondCallURL);
  if (!resultData2.data) {
    return [false, null, null];
  }
  const secondProtocols = resultData2.data.protocols;

  const isProfitable = amountDiff.lt(
    ethers.BigNumber.from(resultData2.data.toTokenAmount)
  );

  const fromTokenAmount = Number(
    ethers.utils.formatUnits(
      resultData1.data.fromTokenAmount,
      resultData1.data.fromToken.decimals
    )
  );
  const toTokenAmount = Number(
    ethers.utils.formatUnits(
      resultData2.data.toTokenAmount,
      resultData2.data.toToken.decimals
    )
  );
  const difference = Number(toTokenAmount) - Number(fromTokenAmount);
  const percentage = (difference / Number(fromTokenAmount)) * 100;

  if (isProfitable) {
    let endTime = Date.now();
    let timeDiff = (endTime - startTime) / 1000;
    devLogger.debug(
      `1inch.index.checkArbitrage: [${fromToken.symbol}]->[${
        toToken.symbol
      }]; isPft:${isProfitable}; amtDiff:${difference}; pct:${percentage.toFixed(
        3
      )}; pftDur:${timeDiff.toFixed(3)};T:[${formatDate(
        startTime
      )}-${formatDate(endTime)}];`
    );
    devLogger.debug(`_1st_data_:${JSON.stringify(resultData1.data)};`);
    devLogger.debug(`_2nd_data_:${JSON.stringify(resultData2.data)};`);
  }

  // isProfitable &&
  //   console.warn(
  //     _loanAmount,
  //     ethers.utils.formatUnits(resultData2.toTokenAmount, resultData2.toToken.decimals)
  //   );

  return [
    isProfitable,
    firstProtocols,
    secondProtocols,
    toTokenAmount.toFixed(2),
  ];
}

const getProtocols = (protocols: IProtocol[][][]): IRoute[] => {
  let route: IRoute[] = [];
  const mainRoute = protocols[0];
  for (const onehop of mainRoute) {
    const besthop = getMaxPart(onehop);
    route.push({
      name: besthop.name,
      toTokenAddress: besthop.toTokenAddress,
    });
  }
  return route;
};

const getMaxPart = (onehop: IProtocol[]): IProtocol => {
  let maxPart = 0;
  let key = 0;
  onehop.forEach((protocol, index) => {
    if (maxPart < protocol.part) {
      maxPart = protocol.part;
      key = index;
    }
  });
  return onehop[key];
};

const getRoutes = (protocols: IProtocol[][][]): IRoute[] => {
  let routes = getProtocols(protocols);
  for (const route of routes) {
    route.toTokenAddress = replaceTokenAddress(
      route.toTokenAddress,
      ERC20Token.MATIC.address,
      ERC20Token.WMATIC.address
    );
  }
  return routes;
};
