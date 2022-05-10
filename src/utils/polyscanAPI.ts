import { sendRequest } from "./request";
import * as log4js from "log4js";
const devLogger = log4js.getLogger("develop");

export async function getGasPriceFromPolyscan(): Promise<number> {
  devLogger.debug(`polyscanAPI.getGasPriceFromPolyscan: 1.0;`);
  let gasPrice = 335;

  const apiURL =
    "https://api.polygonscan.com/api?module=gastracker&action=gasoracle&apikey=VMEXC29UD9CPJN9HQDZEUAQQURBCNZ1YYW";

  const resultData = await sendRequest(apiURL);
  gasPrice = resultData.data.result.FastGasPrice;

  //const safeGasPrice = resultData1.data.protocols;
  devLogger.debug(`polyscanAPI.getGasPriceFromPolyscan: 2.0;`);
  return gasPrice;
}
