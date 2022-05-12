import { sendRequest } from "./request";

export async function getGasPriceFromPolyscan(): Promise<number> {
  let gasPrice = 335;

  const apiURL =
    "https://api.polygonscan.com/api?module=gastracker&action=gasoracle&apikey=VMEXC29UD9CPJN9HQDZEUAQQURBCNZ1YYW";

  const resultData = await sendRequest(apiURL);
  gasPrice = resultData.data.result.FastGasPrice;

  //const safeGasPrice = resultData1.data.protocols;
  return gasPrice;
}
