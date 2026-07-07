export type TrameType = 'POSITION' | 'EVENT' | 'HEARTBEAT';

export type EventType =
  | 'SORTIE_ZONE'
  | 'VITESSE_EXCESSIVE'
  | 'DECOLLEMENT_TRACEUR'
  | 'NON_MOUVEMENT'
  | 'BATTERIE_FAIBLE';

export type NetworkType = '2G' | '3G' | '4G';
export type ModeType    = 'WORK' | 'MOVE' | 'STANDBY';

export interface TramePosition {
  type:     'POSITION';
  imei:     string;
  lat:      number;
  lon:      number;
  alt?:     number;
  speed:    number;
  cap:      number;
  sats?:    number;
  hdop?:    number;
  battery:  number;
  acc:      boolean;
  network?: NetworkType;
  ts:       string | number;
}

export interface TrameEvent {
  type:       'EVENT';
  imei:       string;
  event:      EventType;
  lat:        number;
  lon:        number;
  value?:     number;
  threshold?: number;
  ts:         string | number;
}

export interface TrameHeartbeat {
  type:     'HEARTBEAT';
  imei:     string;
  battery:  number;
  rssi?:    number;
  mode:     ModeType;
  ts:       string | number;
}

export type Trame = TramePosition | TrameEvent | TrameHeartbeat;