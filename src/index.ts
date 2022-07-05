import { BigNumber, ethers } from "ethers";
import { promisify } from "util";
import { getABI, getImplABI } from "./grabABI";
import { IgApiClient } from "instagram-private-api";
import svg2img, { svg2imgOptions } from "svg2img";
import { FormatTypes } from "ethers/lib/utils";

const timerMins = (mins: number) =>
  new Promise((res) => setTimeout(res, mins * 60 * 1000));

const exists = (expr: any) => {
  if (expr) {
    return expr;
  } else {
    throw new ReferenceError("found an undefined");
  }
};
declare enum Format {
  jpeg = "jpeg",
  jpg = "jpg",
  png = "png",
}
const getNounsJPGBuffer = async (
  nounsContract: ethers.Contract,
  id: number
): Promise<Buffer> => {
  const uri = await nounsContract.tokenURI(id);

  const URI = uri.split(",")[1];

  let b64obj = Buffer.from(URI, "base64").toString("utf-8");
  const b64svg = JSON.parse(b64obj).image;
  const opts: svg2imgOptions = { format: Format.jpg, quality: 100 };
  svg2img(b64svg, opts, (err, buff) => {
    if (err) throw err;
    return buff;
  });
  // return svg2imgAsync(b64svg, { format: "jpg" });
};

const getAuctionInfo = async (
  ahContract: ethers.Contract,
  id: number,
  provider: ethers.providers.Provider
): Promise<[winner: string, amount: number, timestamp: number] | null> => {
  const filter = ahContract.filters.AuctionSettled(id);
  let res;
  try {
    res = await ahContract.queryFilter(filter);
  } catch (e) {
    throw e;
  }
  if (res == undefined) {
    throw "undefined query filter response";
  } else if (res.length !== 0) {
    const winnerAddr = res[0].args?.winner;
    const amount = +(+res[0].args?.amount / 1e18).toFixed(2);
    const ens = await provider.lookupAddress(winnerAddr);
    const block = await provider.getBlock(+res[0].blockNumber);

    const ensOrAddr = ens ? ens : winnerAddr;
    return [ensOrAddr, amount, block.timestamp];
  } else {
    return null;
  }
};

const handleAuctionSettled = async (
  auctionHouseContract: ethers.Contract,
  nftContract: ethers.Contract,
  id: number,
  provider: ethers.providers.Provider,
  ig: IgApiClient
): Promise<number> => {
  let caption: string;
  if (id % 10 !== 0) {
    const maybeInfo = await getAuctionInfo(auctionHouseContract, id, provider);
    if (maybeInfo == null) {
      console.log(`polled id: ${id}`);
      return id;
    }
    const [winner, amount, ts] = maybeInfo;
    const date = new Date(ts * 1000);
    const dateString = `${date.getMonth()}-${date.getDate()}-${date
      .getFullYear()
      .toString()
      .slice(2)}`;
    caption = `Noun ${id} was auctioned for ${amount} ETH to ${winner} on ${dateString}`;
  } else {
    caption = `Noun ${id} was minted to the Nounders`;
  }
  const jpgBuff = await getNounsJPGBuffer(nftContract, id);
  try {
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
  return id + 1;
};

const handleNounMint = async (
  nounId: BigNumber,
  nounsNFTContract: ethers.Contract,
  ig: IgApiClient
) => {
  try {
    const jpgBuff = await getNounsJPGBuffer(nounsNFTContract, +nounId);

    const pfp = await ig.account.changeProfilePicture(jpgBuff.slice());

    const story = await ig.publish.story({
      file: jpgBuff,
      caption: `Noun ${nounId}`,
    });

    if (pfp.status !== "ok") {
      throw "Publish failed";
    } else {
      console.log(`Posted pfp ${nounId}`);
    }

    if (story.status !== "ok") {
      throw "Story failed";
    } else {
      console.log(`Posted story ${nounId}`);
    }
  } catch (e) {
    console.log(e);
  }
};

const main = async () => {
  const ig = new IgApiClient();
  ig.state.generateDevice(exists(process.env.IG_USERNAME));
  await ig.account.login(
    exists(process.env.IG_USERNAME),
    exists(process.env.IG_PASSWORD)
  );

  const url = exists(process.env.RPC_URL);
  const provider = new ethers.providers.JsonRpcProvider(url);

  const nounsNFTaddr = "0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03";
  // const nounsNFTaddr = "0x4b10701Bfd7BFEdc47d50562b76b436fbB5BdB3B"; //lilnouns
  const nftAbi = await getABI(nounsNFTaddr);
  const nftContract = new ethers.Contract(nounsNFTaddr, nftAbi, provider);

  // const nounsAHaddr = "0x55e0F7A3bB39a28Bd7Bcc458e04b3cF00Ad3219E"; // lilnouns
  const nounsAHaddr = "0x830BD73E4184ceF73443C15111a1DF14e495C706";
  const AHabi = await getImplABI(nounsAHaddr, provider);
  const auctionHouseContract = new ethers.Contract(
    nounsAHaddr,
    AHabi,
    provider
  );
  let id = +exists(process.env.START_ID);
  const poolIntervalMins = +exists(process.env.POST_INTERVAL_MINS);

  nftContract.on("NounCreated", async (nounId, _seed) => {
    await handleNounMint(nounId, nftContract, ig);
  });

  try {
    while (true) {
      id = await handleAuctionSettled(
        auctionHouseContract,
        nftContract,
        id,
        provider,
        ig
      );
      await timerMins(poolIntervalMins);
    }
  } catch (e) {
    throw `${e} occured at ID # ${id}`;
  }
};

(() => main())();
