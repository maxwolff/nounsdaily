import axios from "axios";
import { ethers } from "ethers";
import * as fs from "fs";
import { promisify } from "util";
const path = require("path");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

export const getABI = async (addr: string): Promise<string> => {
  const dirName = "abis";
  const fp = path.join(dirName, `ABI-${addr}.json`);
  console.log("FP:", path.resolve(fp));
  try {
    if (!fs.existsSync(fp)) {
      const abi = await fetchURL(addr, fp);
      if (!fs.existsSync(dirName)) {
        await mkdir(dirName);
      }
      await writeFile(fp, abi);
      console.log(`WROTE ABI for ${addr}`);
      return abi;
    } else {
      const file = await readFile(fp);
      console.log(`FOUND ABI for ${addr}`);
      return file.toString();
    }
  } catch (e) {
    throw e;
  }
};

export const getImplABI = async (
  addrProxy: string,
  provider: ethers.providers.Provider
): Promise<string> => {
  const impl = await provider.getStorageAt(
    addrProxy,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  ); // transparent proxy
  const coder = new ethers.utils.AbiCoder();
  const implAddr = coder.decode(["address"], impl)[0];
  return getABI(implAddr);
};

const fetchURL = async (addr: string, fp: string): Promise<string> => {
  try {
    const url = `https://api.etherscan.io/api?module=contract&action=getabi&address=${addr}`;
    const { data } = await axios.get(url);
    return data.result;
  } catch (e) {
    throw e;
  }
};

// (async () => {
//   const addr: string = exists(process.env.ADDRESS);
//   await getABI(addr);
// })().catch((e) => {
//   throw e;
// });
