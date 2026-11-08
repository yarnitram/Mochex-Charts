export interface CuratedCoin {
  symbol: string;
  name: string;
  category: "majors" | "memes" | "ai";
  description?: string;
}

export const MAJORS_UNIVERSE: CuratedCoin[] = [
  { symbol: "BTCUSDT", name: "Bitcoin", category: "majors" },
  { symbol: "ETHUSDT", name: "Ethereum", category: "majors" },
  { symbol: "SOLUSDT", name: "Solana", category: "majors" },
  { symbol: "XRPUSDT", name: "XRP", category: "majors" },
  { symbol: "SUIUSDT", name: "Sui", category: "majors" },
  { symbol: "DOGEUSDT", name: "Dogecoin", category: "majors" },
  { symbol: "BNBUSDT", name: "BNB", category: "majors" },
  { symbol: "AVAXUSDT", name: "Avalanche", category: "majors" },
  { symbol: "NEARUSDT", name: "Near Protocol", category: "majors" },
  { symbol: "ADAUSDT", name: "Cardano", category: "majors" },
  { symbol: "LINKUSDT", name: "Chainlink", category: "majors" },
  { symbol: "APTUSDT", name: "Aptos", category: "majors" },
  { symbol: "ARBUSDT", name: "Arbitrum", category: "majors" },
  { symbol: "OPUSDT", name: "Optimism", category: "majors" },
  { symbol: "TIAUSDT", name: "Celestia", category: "majors" },
  { symbol: "INJUSDT", name: "Injective", category: "majors" },
  { symbol: "SEIUSDT", name: "Sei", category: "majors" },
  { symbol: "RENDERUSDT", name: "Render", category: "majors" },
  { symbol: "FTMUSDT", name: "Fantom", category: "majors" },
  { symbol: "DOTUSDT", name: "Polkadot", category: "majors" },
  { symbol: "LTCUSDT", name: "Litecoin", category: "majors" },
  { symbol: "BCHUSDT", name: "Bitcoin Cash", category: "majors" },
  { symbol: "KASUSDT", name: "Kaspa", category: "majors" },
  { symbol: "STXUSDT", name: "Stacks", category: "majors" },
  { symbol: "UNIUSDT", name: "Uniswap", category: "majors" },
  { symbol: "ICPUSDT", name: "Internet Computer", category: "majors" },
  { symbol: "TAOUSDT", name: "Bittensor", category: "majors" },
  { symbol: "FETUSDT", name: "Artificial Superintelligence", category: "majors" },
  { symbol: "PEPEUSDT", name: "Pepe", category: "majors" },
  { symbol: "WIFUSDT", name: "dogwifhat", category: "majors" },
];

export const TOP_50_MEMES: CuratedCoin[] = [
  { symbol: "DOGEUSDT", name: "Dogecoin", category: "memes" },
  { symbol: "SHIBUSDT", name: "Shiba Inu", category: "memes" },
  { symbol: "PEPEUSDT", name: "Pepe", category: "memes" },
  { symbol: "WIFUSDT", name: "dogwifhat", category: "memes" },
  { symbol: "BONKUSDT", name: "Bonk", category: "memes" },
  { symbol: "FLOKIUSDT", name: "Floki", category: "memes" },
  { symbol: "BRETTUSDT", name: "Brett", category: "memes" },
  { symbol: "POPCATUSDT", name: "Popcat", category: "memes" },
  { symbol: "NEIROUSDT", name: "First Neiro on ETH", category: "memes" },
  { symbol: "SPXUSDT", name: "SPX6900", category: "memes" },
  { symbol: "MEWUSDT", name: "cat in a dogs world", category: "memes" },
  { symbol: "TURBOUSDT", name: "Turbo", category: "memes" },
  { symbol: "BABYDOGEUSDT", name: "Baby Doge Coin", category: "memes" },
  { symbol: "MOGUSDT", name: "Mog Coin", category: "memes" },
  { symbol: "BOMEUSDT", name: "BOOK OF MEME", category: "memes" },
  { symbol: "MEMEUSDT", name: "Memecoin", category: "memes" },
  { symbol: "SLERFUSDT", name: "Slerf", category: "memes" },
  { symbol: "MYROUSDT", name: "Myro", category: "memes" },
  { symbol: "PONKEUSDT", name: "Ponke", category: "memes" },
  { symbol: "GIGAUSDT", name: "GigaChad", category: "memes" },
  { symbol: "GOATUSDT", name: "Goatseus Maximus", category: "memes" },
  { symbol: "MOODENGUSDT", name: "Moo Deng", category: "memes" },
  { symbol: "ACTUSDT", name: "Act I : The AI Prophecy", category: "memes" },
  { symbol: "PNUTUSDT", name: "Peanut the Squirrel", category: "memes" },
  { symbol: "PEOPLEUSDT", name: "ConstitutionDAO", category: "memes" },
  { symbol: "COQUSDT", name: "Coq Inu", category: "memes" },
  { symbol: "WOJAKUSDT", name: "Wojak", category: "memes" },
  { symbol: "AIDOGEUSDT", name: "Arb Doge AI", category: "memes" },
  { symbol: "LADYSUSDT", name: "Milady Meme Coin", category: "memes" },
  { symbol: "CORGIAIUSDT", name: "CorgiAI", category: "memes" },
  { symbol: "SAMOUSDT", name: "Samoyedcoin", category: "memes" },
  { symbol: "ELONUSDT", name: "Dogelon Mars", category: "memes" },
  { symbol: "TSUKIUSDT", name: "Tsuki", category: "memes" },
  { symbol: "RETARDIOUSDT", name: "Retardio", category: "memes" },
  { symbol: "SUNDOGUSDT", name: "Sundog", category: "memes" },
  { symbol: "DOGSUSDT", name: "Dogs", category: "memes" },
  { symbol: "CATUSDT", name: "Simon's Cat", category: "memes" },
  { symbol: "BANUSDT", name: "Comedian BAN", category: "memes" },
  { symbol: "LUCEUSDT", name: "Luce", category: "memes" },
  { symbol: "CHILLGUYUSDT", name: "Just a chill guy", category: "memes" },
  { symbol: "CHEEMSUSDT", name: "Cheems", category: "memes" },
  { symbol: "BILLYUSDT", name: "Billy", category: "memes" },
  { symbol: "MICHIUSDT", name: "Michi", category: "memes" },
  { symbol: "FWOGUSDT", name: "Fwog", category: "memes" },
  { symbol: "GNONUSDT", name: "Numogram", category: "memes" },
  { symbol: "DODOCUSDT", name: "Dodo", category: "memes" },
  { symbol: "DUKOUSDT", name: "Duko", category: "memes" },
  { symbol: "TOSHIUSDT", name: "Toshi", category: "memes" },
  { symbol: "DEGENUSDT", name: "Degen", category: "memes" },
  { symbol: "MANEKIUSDT", name: "Maneki", category: "memes" },
];

export const TOP_50_AI: CuratedCoin[] = [
  { symbol: "TAOUSDT", name: "Bittensor", category: "ai" },
  { symbol: "NEARUSDT", name: "Near Protocol", category: "ai" },
  { symbol: "RENDERUSDT", name: "Render", category: "ai" },
  { symbol: "FETUSDT", name: "Artificial Superintelligence", category: "ai" },
  { symbol: "ICPUSDT", name: "Internet Computer", category: "ai" },
  { symbol: "VIRTUALUSDT", name: "Virtuals Protocol", category: "ai" },
  { symbol: "ACTUSDT", name: "Act I : The AI Prophecy", category: "ai" },
  { symbol: "GOATUSDT", name: "Goatseus Maximus", category: "ai" },
  { symbol: "GRTUSDT", name: "The Graph", category: "ai" },
  { symbol: "AKTUSDT", name: "Akash Network", category: "ai" },
  { symbol: "PRIMEUSDT", name: "Echelon Prime", category: "ai" },
  { symbol: "ARKMUSDT", name: "Arkham", category: "ai" },
  { symbol: "GLMUSDT", name: "Golem", category: "ai" },
  { symbol: "IOUSDT", name: "io.net", category: "ai" },
  { symbol: "NOSUSDT", name: "Nosana", category: "ai" },
  { symbol: "AIOZUSDT", name: "AIOZ Network", category: "ai" },
  { symbol: "ATHUSDT", name: "Aethir", category: "ai" },
  { symbol: "PAALUSDT", name: "PAAL AI", category: "ai" },
  { symbol: "TRACUSDT", name: "OriginTrail", category: "ai" },
  { symbol: "PHBUSDT", name: "Phoenix", category: "ai" },
  { symbol: "RLCUSDT", name: "iExec RLC", category: "ai" },
  { symbol: "OCEANUSDT", name: "Ocean Protocol", category: "ai" },
  { symbol: "AGIXUSDT", name: "SingularityNET", category: "ai" },
  { symbol: "CLOREUSDT", name: "Clore.ai", category: "ai" },
  { symbol: "NMRUSDT", name: "Numeraire", category: "ai" },
  { symbol: "SPECUSDT", name: "Spectral", category: "ai" },
  { symbol: "CSIXUSDT", name: "Carbon Browser", category: "ai" },
  { symbol: "FORTUSDT", name: "Forta", category: "ai" },
  { symbol: "DEAIUSDT", name: "Zero1 Labs", category: "ai" },
  { symbol: "CGPTUSDT", name: "ChainGPT", category: "ai" },
  { symbol: "RSS3USDT", name: "RSS3", category: "ai" },
  { symbol: "ALIUSDT", name: "Artificial Liquid Intelligence", category: "ai" },
  { symbol: "LAIUSDT", name: "LayerAI", category: "ai" },
  { symbol: "VRAUSDT", name: "Verasity", category: "ai" },
  { symbol: "MDTUSDT", name: "Measurable Data Token", category: "ai" },
  { symbol: "AIUSDT", name: "Sleepless AI", category: "ai" },
  { symbol: "DATAUSDT", name: "Streamr", category: "ai" },
  { symbol: "ORAIUSDT", name: "Oraichain", category: "ai" },
  { symbol: "NUMUSDT", name: "Numbers Protocol", category: "ai" },
  { symbol: "GPUUSDT", name: "Node AI", category: "ai" },
  { symbol: "HYPCUSDT", name: "HyperCycle", category: "ai" },
  { symbol: "KNDXUSDT", name: "Kndx", category: "ai" },
  { symbol: "OCTAUSDT", name: "OctaSpace", category: "ai" },
  { symbol: "AGIUSDT", name: "Delysium", category: "ai" },
  { symbol: "SORAUSDT", name: "Sora Validator Token", category: "ai" },
  { symbol: "HEARTUSDT", name: "Humans.ai", category: "ai" },
  { symbol: "GNUSDT", name: "Genius", category: "ai" },
  { symbol: "MANUSDT", name: "Matrix AI Network", category: "ai" },
  { symbol: "BADUSDT", name: "Bad Idea AI", category: "ai" },
  { symbol: "COMAIUSDT", name: "Commune AI", category: "ai" },
];

export type RadarUniverseTab = "majors" | "memes" | "ai" | "custom";

export function getUniverseCoins(
  tab: RadarUniverseTab,
  customSymbols: string[] = []
): CuratedCoin[] {
  switch (tab) {
    case "majors":
      return MAJORS_UNIVERSE;
    case "memes":
      return TOP_50_MEMES;
    case "ai":
      return TOP_50_AI;
    case "custom":
      return customSymbols.map((sym) => {
        const upper = sym.toUpperCase().trim();
        const found =
          MAJORS_UNIVERSE.find((c) => c.symbol === upper) ||
          TOP_50_MEMES.find((c) => c.symbol === upper) ||
          TOP_50_AI.find((c) => c.symbol === upper);
        return {
          symbol: upper.endsWith("USDT") ? upper : `${upper}USDT`,
          name: found ? found.name : upper.replace("USDT", ""),
          category: "majors",
        };
      });
    default:
      return MAJORS_UNIVERSE;
  }
}
