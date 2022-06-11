NOUN NFT at `0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03` , grab TokenURIs for every ID

set -o allexport
source .env
docker build . -t m/nouns-ig-bot
docker run --env-file=.env m/nouns-ig-bot

docker exec -it m/nouns-ig-bot bash
