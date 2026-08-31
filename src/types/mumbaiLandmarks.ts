export interface MumbaiLandmark {
  key: string;
  name: string;
  area: 'Central & South Mumbai' | 'Western Suburbs' | 'Navi Mumbai' | 'Eastern Suburbs';
  lat: number;
  lng: number;
  address: string;
  description: string;
}

export const MUMBAI_LANDMARKS: Record<string, MumbaiLandmark> = {
  bkc: {
    key: 'bkc',
    name: 'Bandra Kurla Complex (BKC)',
    area: 'Central & South Mumbai',
    lat: 19.0657,
    lng: 72.8687,
    address: 'Asian Heart Institute & Research Centre, G Block BKC, Bandra East, Mumbai 400051',
    description: 'Premier medical and corporate financial hub with central pathology labs'
  },
  nerul: {
    key: 'nerul',
    name: 'Nerul, Navi Mumbai',
    area: 'Navi Mumbai',
    lat: 19.0330,
    lng: 73.0297,
    address: 'Apollo Hospitals, Plot 13, Sector 23, Uran Road, Nerul, Navi Mumbai 400706',
    description: 'Super-specialty clinical diagnostic center and pathology network hub'
  },
  andheri_west: {
    key: 'andheri_west',
    name: 'Andheri West',
    area: 'Western Suburbs',
    lat: 19.1363,
    lng: 72.8277,
    address: 'Kokilaben Dhirubhai Ambani Hospital, Rao Saheb Achutrao Patwardhan Marg, Andheri West, Mumbai 400053',
    description: 'Major tertiary hospital and dense suburban clinic collection network'
  },
  dadar: {
    key: 'dadar',
    name: 'Dadar West',
    area: 'Central & South Mumbai',
    lat: 19.0178,
    lng: 72.8478,
    address: 'P. D. Hinduja Hospital & Medical Research Centre, Veer Savarkar Marg, Dadar West, Mumbai 400016',
    description: 'Central Mumbai medical corridor and reference research laboratory'
  },
  powai: {
    key: 'powai',
    name: 'Powai (Hiranandani)',
    area: 'Eastern Suburbs',
    lat: 19.1176,
    lng: 72.9060,
    address: 'Dr. L. H. Hiranandani Hospital, Hillside Avenue, Hiranandani Gardens, Powai, Mumbai 400076',
    description: 'Eastern suburbs multi-specialty care hospital and clinical research center'
  },
  vashi: {
    key: 'vashi',
    name: 'Vashi, Navi Mumbai',
    area: 'Navi Mumbai',
    lat: 19.0771,
    lng: 72.9986,
    address: 'Fortis Reference Lab, Sector 17 Commercial Hub, Vashi, Navi Mumbai 400703',
    description: 'Navi Mumbai central specimen intake facility and referral bio-repository'
  }
};
