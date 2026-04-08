export interface Slot {
  id: string;
  name: string;
  bet: number;
  type: string;
  earning: number;
  multi: number;
  isOpened: boolean;
}

export interface HuntStats {
  start: number;
  creator: string;
  streamer: string;
  isRankingEnabled: boolean;
}