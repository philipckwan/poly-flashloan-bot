import { ethers } from "ethers";
import { dodoV2Pool, ERC20Token, uniswapRouter } from "../constants/addresses";

export const getBigNumber = (amount: number, decimals = 18) => {
  return ethers.utils.parseUnits(amount.toString(), decimals);
};

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

export const preventUnderflow = (amount: number, decimals: number): string => {
  if (amount.toString().length > decimals) {
    return amount.toFixed(decimals).toString();
  }
  return amount.toString();
};

export const replaceTokenAddress = (
  token: string,
  address: string,
  newAddress: string
) => {
  return token === address ? newAddress : token;
};

export const findRouter = (router: string) => {
  for (let k of Object.keys(uniswapRouter)) {
    if (router.toLowerCase() === uniswapRouter[k].toLowerCase()) {
      return k;
    }
  }
  return "UNKNOWN";
};

/**
 *
 * @param token address
 * @returns token symbol
 */
export const findToken = (token: string): string => {
  for (let k of Object.keys(ERC20Token)) {
    if (token.toLowerCase() === ERC20Token[k].address.toLowerCase()) {
      return k;
    }
  }
  return "UNKNOWN";
};

export const findPool = (pool: string) => {
  for (let k of Object.keys(dodoV2Pool)) {
    if (pool.toLowerCase() === dodoV2Pool[k].toLowerCase()) {
      return k;
    }
  }
  return "UNKNOWN";
};

/**
 * @param protocol
 * @returns router address
 */
export const findRouterFromProtocol = (protocol: number) => {
  return uniswapRouter[Object.keys(uniswapRouter)[protocol]];
};

export const formatDate = (d: number) => {
  let aDate = new Date(d);
  let month = aDate.getMonth() + 1;
  let date = aDate.getDate();
  let hour = aDate.getHours();
  let minute = aDate.getMinutes();
  let second = aDate.getSeconds();
  let mSec = aDate.getMilliseconds();
  let testVal = process.env.TEST_KEY;
  //clog.debug(`utility.formatDate: testVal:${testVal};`);
  return `${date.toString().padStart(2, "0")}/${month
    .toString()
    .padStart(2, "0")}@${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}:${second.toString().padStart(2, "0")}:${mSec
    .toString()
    .padStart(3, "0")}`;
};
