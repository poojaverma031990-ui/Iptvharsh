export interface IPTVChannel {
  name: string;
  url: string;
  logo?: string;
  group?: string;
  id?: string;
}

export interface ChannelGroup {
  name: string;
  channels: IPTVChannel[];
}
