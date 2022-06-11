import { ethers } from "ethers";
import { promisify } from "util";
import { getABI, getImplABI } from "./grabABI";
import { IgApiClient } from "instagram-private-api";

const svg2img = require("svg2img");

const ig = new IgApiClient();
const svg2imgAsync = promisify(svg2img);

const exists = (expr: any) => {
  if (expr) {
    return expr;
  } else {
    throw new ReferenceError("found an undefined");
  }
};

const post = async (jpgBuff: Buffer, caption: string) => {
  try {
    ig.state.generateDevice(exists(process.env.IG_USERNAME));
    await ig.account.login(
      exists(process.env.IG_USERNAME),
      exists(process.env.IG_PASSWORD)
    );

    const publishResult = await ig.publish.photo({
      file: jpgBuff,
      caption,
    });

    if (publishResult.status !== "ok") {
      throw "Publish failed";
    } else {
      console.log(`Posted ${caption}`);
    }
  } catch (e) {
    console.log(e);
  }
};

const getNounsJPGBuffer = async (
  nounsContract: ethers.Contract,
  id: number
): Promise<Buffer> => {
  const uri = await nounsContract.tokenURI(id);

  const URI = uri.split(",")[1];

  let b64obj = Buffer.from(URI, "base64").toString("utf-8");
  const b64svg = JSON.parse(b64obj).image;

  return svg2imgAsync(b64svg, { format: "jpg" });
};

const getAuctionInfo = async (
  ahContract: ethers.Contract,
  id: number,
  provider: ethers.providers.Provider
): Promise<[winner: string, amount: number] | null> => {
  const filter = ahContract.filters.AuctionSettled(id);
  const res = await ahContract.queryFilter(filter);
  if (res.length !== 0) {
    const winnerAddr = res[0].args?.winner;
    const amount = +(+res[0].args?.amount / 1e18).toFixed(2);
    const ens = await provider.lookupAddress(winnerAddr);
    const ensOrAddr = ens ? ens : winnerAddr;
    return [ensOrAddr, amount];
  } else {
    return null;
  }
};

const postLoop = async (
  auctionHouseContract: ethers.Contract,
  nftContract: ethers.Contract,
  id: number,
  provider: ethers.providers.Provider
): Promise<number> => {
  let caption: string;
  if (id % 10 !== 0) {
    const maybeInfo = await getAuctionInfo(auctionHouseContract, id, provider);
    if (maybeInfo == null) {
      console.log(`polled id: ${id}`);
      return id;
    }
    const [winner, amount] = maybeInfo;
    caption = `Noun ${id} was auctioned for ${amount} ETH to ${winner}`;
  } else {
    caption = `Noun ${id} was minted to the Nounders`;
  }
  const buff = await getNounsJPGBuffer(nftContract, id);
  await post(buff, caption);
  return id + 1;
};

const timerMins = (mins: number) =>
  new Promise((res) => setTimeout(res, mins * 60 * 1000));

const main = async () => {
  const url = exists(process.env.RPC_URL);
  const provider = new ethers.providers.JsonRpcProvider(url);

  const nounsNFTaddr = exists(process.env.NOUNS_NFT_ADDR);
  const nftAbi = await getABI(nounsNFTaddr);
  const nftContract = new ethers.Contract(nounsNFTaddr, nftAbi, provider);

  const nounsAHaddr = exists(process.env.NOUNS_AUCTION_HOUSE_ADDR);
  const AHabi = await getImplABI(nounsAHaddr, provider);
  const auctionHouseContract = new ethers.Contract(
    nounsAHaddr,
    AHabi,
    provider
  );
  let id = +exists(process.env.START_ID);
  const poolIntervalMins = +exists(process.env.POST_INTERVAL_MINS);
  try {
    while (true) {
      id = await postLoop(auctionHouseContract, nftContract, id, provider);
      await timerMins(poolIntervalMins);
    }
  } catch (e) {
    throw `${e} occured at ID # ${id}`;
  }
};

(() => main())();
