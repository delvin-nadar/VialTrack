import { GeoPoint } from 'firebase/firestore';
import { db, toFirestoreGeoPoint } from './firebase';
import { doc, writeBatch, setDoc } from 'firebase/firestore';
import {
  Client,
  PickupBoy,
  PickupTask,
  AttendanceRecord,
  LocationPing,
  Route
} from '../types';
import { StorageService } from './storage';
import { generateSampleVialPhoto } from './imageWatermark';

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

/**
 * Builds realistic, production-grade Mumbai mock datasets with native Firestore GeoPoints.
 */
export function generateMumbaiMockData() {
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. RIDERS
  const riders: PickupBoy[] = [
    {
      id: 'rider-rahul',
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      email: 'rahul.sharma@secondmedic.in',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-02-DN-4921',
      vehicleType: 'Hero Splendor Plus (Cold-box Mounted)',
      assignedRouteIds: ['route-andheri-west-1'],
      status: 'active',
      joiningDate: '2025-11-10',
      area: 'Western Suburbs',
      currentLocation: {
        lat: 19.1350,
        lng: 72.8260,
        timestamp: new Date().toISOString(),
        heading: 180,
        accuracy: 4,
        location: toFirestoreGeoPoint(19.1350, 72.8260)
      },
      batteryLevel: 92,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    },
    {
      id: 'rider-sameer',
      name: 'Sameer Khan',
      phone: '+91 98201 55667',
      email: 'sameer.khan@secondmedic.in',
      photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-03-BK-1102',
      vehicleType: 'TVS Jupiter (Chiller Rack)',
      assignedRouteIds: ['route-bkc-express-1'],
      status: 'active',
      joiningDate: '2025-12-01',
      area: 'Central & South Mumbai',
      currentLocation: {
        lat: 19.0665,
        lng: 72.8670,
        timestamp: new Date().toISOString(),
        heading: 90,
        accuracy: 5,
        location: toFirestoreGeoPoint(19.0665, 72.8670)
      },
      batteryLevel: 88,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    },
    {
      id: 'rider-priya',
      name: 'Priya Nair',
      phone: '+91 98192 33445',
      email: 'priya.nair@secondmedic.in',
      photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-43-AP-8841',
      vehicleType: 'Honda Activa 6G (Cold Pack)',
      assignedRouteIds: ['route-nerul-vashi-1'],
      status: 'active',
      joiningDate: '2026-01-15',
      area: 'Navi Mumbai',
      currentLocation: {
        lat: 19.0345,
        lng: 73.0280,
        timestamp: new Date().toISOString(),
        heading: 45,
        accuracy: 6,
        location: toFirestoreGeoPoint(19.0345, 73.0280)
      },
      batteryLevel: 96,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    },
    {
      id: 'rider-amit',
      name: 'Amit Verma',
      phone: '+91 98765 88990',
      email: 'amit.verma@secondmedic.in',
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-04-EK-9022',
      vehicleType: 'Honda Activa 6G (Chiller Rack)',
      assignedRouteIds: ['route-dadar-loop-1'],
      status: 'active',
      joiningDate: '2026-01-05',
      area: 'Central & South Mumbai',
      currentLocation: {
        lat: 19.0185,
        lng: 72.8460,
        timestamp: new Date().toISOString(),
        heading: 270,
        accuracy: 7,
        location: toFirestoreGeoPoint(19.0185, 72.8460)
      },
      batteryLevel: 79,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    },
    {
      id: 'rider-vikram',
      name: 'Vikram Patil',
      phone: '+91 98205 77889',
      email: 'vikram.patil@secondmedic.in',
      photoUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-03-PW-6630',
      vehicleType: 'Bajaj Pulsar 150 (Temp-Controlled)',
      assignedRouteIds: ['route-powai-loop-1'],
      status: 'active',
      joiningDate: '2026-02-01',
      area: 'Eastern Suburbs',
      currentLocation: {
        lat: 19.1190,
        lng: 72.9045,
        timestamp: new Date().toISOString(),
        heading: 135,
        accuracy: 5,
        location: toFirestoreGeoPoint(19.1190, 72.9045)
      },
      batteryLevel: 89,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    },
    {
      id: 'rider-rohit',
      name: 'Rohit Jadhav',
      phone: '+91 98334 11223',
      email: 'rohit.jadhav@secondmedic.in',
      photoUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=300&h=300&fit=crop&crop=faces&q=80',
      vehicleNumber: 'MH-43-VS-9912',
      vehicleType: 'TVS Apache RTR 160 (Specimen Box)',
      assignedRouteIds: ['route-vashi-express-1'],
      status: 'active',
      joiningDate: '2026-02-10',
      area: 'Navi Mumbai',
      currentLocation: {
        lat: 19.0760,
        lng: 72.9970,
        timestamp: new Date().toISOString(),
        heading: 315,
        accuracy: 6,
        location: toFirestoreGeoPoint(19.0760, 72.9970)
      },
      batteryLevel: 94,
      isOnline: true,
      isCheckedIn: true,
      lastPingTime: new Date().toISOString()
    }
  ];

  // 2. CLIENTS
  const clients: Client[] = [
    {
      id: 'client-bkc-metropolis',
      name: 'Metropolis Healthcare BKC Central Hub',
      contactPerson: 'Dr. Anita Desai (Ops Director)',
      phone: '+91 98200 11223',
      email: 'ops.bkc@metropolisindia.com',
      address: MUMBAI_LANDMARKS.bkc.address,
      area: 'Central & South Mumbai',
      lat: MUMBAI_LANDMARKS.bkc.lat,
      lng: MUMBAI_LANDMARKS.bkc.lng,
      location: toFirestoreGeoPoint(MUMBAI_LANDMARKS.bkc.lat, MUMBAI_LANDMARKS.bkc.lng),
      active: true,
      createdAt: '2026-01-15T09:00:00Z',
      billingRatePerPickup: 550
    },
    {
      id: 'client-nerul-apollo',
      name: 'Apollo Diagnostics Nerul Center',
      contactPerson: 'Dr. Rajesh Nair (Chief Pathologist)',
      phone: '+91 98200 22334',
      email: 'pathology.nerul@apollohealth.com',
      address: MUMBAI_LANDMARKS.nerul.address,
      area: 'Navi Mumbai',
      lat: MUMBAI_LANDMARKS.nerul.lat,
      lng: MUMBAI_LANDMARKS.nerul.lng,
      location: toFirestoreGeoPoint(MUMBAI_LANDMARKS.nerul.lat, MUMBAI_LANDMARKS.nerul.lng),
      active: true,
      createdAt: '2026-01-20T09:00:00Z',
      billingRatePerPickup: 480
    },
    {
      id: 'client-andheri-apex',
      name: 'Apex Diagnostic Centre Andheri West',
      contactPerson: 'Dr. Sunita Rao (Ops Head)',
      phone: '+91 98200 33445',
      email: 'intake@apexdiagnostics.in',
      address: MUMBAI_LANDMARKS.andheri_west.address,
      area: 'Western Suburbs',
      lat: MUMBAI_LANDMARKS.andheri_west.lat,
      lng: MUMBAI_LANDMARKS.andheri_west.lng,
      location: toFirestoreGeoPoint(MUMBAI_LANDMARKS.andheri_west.lat, MUMBAI_LANDMARKS.andheri_west.lng),
      active: true,
      createdAt: '2026-01-10T09:00:00Z',
      billingRatePerPickup: 450
    },
    {
      id: 'client-dadar-hinduja',
      name: 'Hinduja Pathology Satellite Clinic Dadar',
      contactPerson: 'Dr. Farhan Merchant (Lab In-charge)',
      phone: '+91 98200 44556',
      email: 'lab.dadar@hindujahospital.com',
      address: MUMBAI_LANDMARKS.dadar.address,
      area: 'Central & South Mumbai',
      lat: MUMBAI_LANDMARKS.dadar.lat,
      lng: MUMBAI_LANDMARKS.dadar.lng,
      location: toFirestoreGeoPoint(MUMBAI_LANDMARKS.dadar.lat, MUMBAI_LANDMARKS.dadar.lng),
      active: true,
      createdAt: '2026-02-01T10:00:00Z',
      billingRatePerPickup: 500
    },
    {
      id: 'client-powai-hiranandani',
      name: 'Hiranandani Pathology Research Lab Powai',
      contactPerson: 'Dr. Alok Verma (Pathology Lead)',
      phone: '+91 98200 55667',
      email: 'biochem.powai@hiranandanihospital.org',
      address: MUMBAI_LANDMARKS.powai.address,
      area: 'Eastern Suburbs',
      lat: MUMBAI_LANDMARKS.powai.lat,
      lng: MUMBAI_LANDMARKS.powai.lng,
      location: toFirestoreGeoPoint(MUMBAI_LANDMARKS.powai.lat, MUMBAI_LANDMARKS.powai.lng),
      active: true,
      createdAt: '2026-02-05T09:00:00Z',
      billingRatePerPickup: 520
    },
    {
      id: 'client-vashi-fortis',
      name: 'Fortis Diagnostics & Collection Hub Vashi',
      contactPerson: 'Dr. Sneha Joshi (Senior Tech)',
      phone: '+91 98200 66778',
      email: 'diagnostics.vashi@fortishealthcare.com',
      address: MUMBAI_LANDMARKS.vashi.address,
      area: 'Navi Mumbai',
      lat: MUMBAI_LANDMARKS.vashi.lat,
      lng: MUMBAI_LANDMARKS.vashi.lng,
      location: toFirestoreGeoPoint(MUMBAI_LANDMARKS.vashi.lat, MUMBAI_LANDMARKS.vashi.lng),
      active: true,
      createdAt: '2026-02-12T09:00:00Z',
      billingRatePerPickup: 490
    }
  ];

  // 3. TASKS
  const photoVial1 = generateSampleVialPhoto('vial', '12 STAT Cardiac Vials (Asian Heart BKC)');
  const photoVial2 = generateSampleVialPhoto('vial', '18 Biopsy Specimens (Kokilaben Andheri)');
  const photoDrop1 = generateSampleVialPhoto('drop', 'Delivered to Apollo Central Lab Nerul');

  const tasks: PickupTask[] = [
    {
      id: `task-${todayStr}-bkc-urgent`,
      title: 'Urgent STAT Cardiac Troponin & D-Dimer Transport - BKC',
      type: 'stat_urgent',
      priority: 'urgent',
      assignedRiderId: 'rider-sameer',
      area: 'Central & South Mumbai',
      date: todayStr,
      timeSlot: '14:00',
      routeId: 'route-bkc-express-1',
      routeName: 'BKC Medical Corridor Express',
      clientId: 'client-bkc-metropolis',
      clientName: 'Metropolis Healthcare BKC Central Hub',
      riderId: 'rider-sameer',
      riderName: 'Sameer Khan',
      riderPhone: '+91 98201 55667',
      riderVehicle: 'MH-03-BK-1102',
      status: 'in_transit',
      currentStopIndex: 1,
      pickupGeoPoint: toFirestoreGeoPoint(19.0657, 72.8687),
      deliveryGeoPoint: toFirestoreGeoPoint(19.0600, 72.8620),
      pickupLocation: {
        name: 'Asian Heart Institute OPD & ICU Specimen Counter',
        address: MUMBAI_LANDMARKS.bkc.address,
        lat: 19.0657,
        lng: 72.8687,
        area: 'Central & South Mumbai',
        location: toFirestoreGeoPoint(19.0657, 72.8687)
      },
      deliveryLocation: {
        name: 'Metropolis Central Reference Lab BKC',
        address: 'Tower B, Parinee Crescenzo, G Block BKC, Mumbai 400051',
        lat: 19.0600,
        lng: 72.8620,
        area: 'Central & South Mumbai',
        location: toFirestoreGeoPoint(19.0600, 72.8620)
      },
      stopsProgress: [
        {
          stopId: 'stop-bkc-asian-heart',
          stopName: 'Asian Heart Institute Specimen Collection Counter',
          address: MUMBAI_LANDMARKS.bkc.address,
          lat: 19.0657,
          lng: 72.8687,
          contactPerson: 'Sister Shweta Menon',
          phone: '+91 98200 99881',
          status: 'picked_up',
          arrivedAt: `${todayStr}T13:45:00Z`,
          completedAt: `${todayStr}T13:52:10Z`,
          sampleCount: 12,
          photoUrl: photoVial1,
          photoLocation: { lat: 19.0657, lng: 72.8687, accuracy: 4 },
          photoTimestamp: `${todayStr}T13:52:10Z`,
          coldBoxTemp: 3.9,
          notes: '12 STAT cardiac profile vials secured in active chiller compartment.'
        }
      ],
      destination: {
        name: 'Metropolis Central Reference Lab BKC',
        address: 'Tower B, Parinee Crescenzo, G Block BKC, Mumbai 400051',
        lat: 19.0600,
        lng: 72.8620,
        coldBoxTempAtDrop: 3.8,
        totalVialsHandedOver: 12,
        notes: 'In-transit to central intake laboratory under active temperature tracking.'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T13:00:00Z`,
      startedAt: `${todayStr}T13:30:00Z`
    },
    {
      id: `task-${todayStr}-andheri-stat`,
      title: 'Histopathology & Biopsy Cold-Chain Run - Andheri West',
      type: 'biopsy_transfer',
      priority: 'urgent',
      assignedRiderId: 'rider-rahul',
      area: 'Western Suburbs',
      date: todayStr,
      timeSlot: '14:00',
      routeId: 'route-andheri-west-1',
      routeName: 'Andheri West - Malad Diagnostic Loop',
      clientId: 'client-andheri-apex',
      clientName: 'Apex Diagnostic Centre Andheri West',
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      riderPhone: '+91 98765 43210',
      riderVehicle: 'MH-02-DN-4921',
      status: 'in_transit',
      currentStopIndex: 1,
      pickupGeoPoint: toFirestoreGeoPoint(19.1363, 72.8277),
      deliveryGeoPoint: toFirestoreGeoPoint(19.1860, 72.8485),
      pickupLocation: {
        name: 'Kokilaben Hospital OPD Specimen Reception',
        address: MUMBAI_LANDMARKS.andheri_west.address,
        lat: 19.1363,
        lng: 72.8277,
        area: 'Western Suburbs',
        location: toFirestoreGeoPoint(19.1363, 72.8277)
      },
      deliveryLocation: {
        name: 'Apex Central Lab Malad West',
        address: 'Opp. Inorbit Mall, New Link Road, Malad West, Mumbai 400064',
        lat: 19.1860,
        lng: 72.8485,
        area: 'Western Suburbs',
        location: toFirestoreGeoPoint(19.1860, 72.8485)
      },
      stopsProgress: [
        {
          stopId: 'stop-andheri-kokilaben',
          stopName: 'Kokilaben Hospital OPD Specimen Reception',
          address: MUMBAI_LANDMARKS.andheri_west.address,
          lat: 19.1363,
          lng: 72.8277,
          contactPerson: 'Dr. Neha Kulkarni',
          phone: '+91 98201 22334',
          status: 'picked_up',
          arrivedAt: `${todayStr}T14:10:00Z`,
          completedAt: `${todayStr}T14:18:00Z`,
          sampleCount: 18,
          photoUrl: photoVial2,
          photoLocation: { lat: 19.1363, lng: 72.8277, accuracy: 5 },
          photoTimestamp: `${todayStr}T14:18:00Z`,
          coldBoxTemp: 4.1,
          notes: 'Biopsy specimens in sealed secondary containment + temperature data logger.'
        }
      ],
      destination: {
        name: 'Apex Central Diagnostic Lab, Malad West',
        address: 'Opp. Inorbit Mall, New Link Road, Malad West, Mumbai 400064',
        lat: 19.1860,
        lng: 72.8485,
        coldBoxTempAtDrop: 4.0,
        totalVialsHandedOver: 18,
        notes: 'Specimen in courier transit along Link Road.'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T13:30:00Z`,
      startedAt: `${todayStr}T13:55:00Z`
    },
    {
      id: `task-${todayStr}-nerul-routine`,
      title: 'Routine Morning Chemistry & CBC Loop - Nerul',
      type: 'routine_loop',
      priority: 'normal',
      assignedRiderId: 'rider-priya',
      area: 'Navi Mumbai',
      date: todayStr,
      timeSlot: '10:00',
      routeId: 'route-nerul-vashi-1',
      routeName: 'Navi Mumbai Arterial Route',
      clientId: 'client-nerul-apollo',
      clientName: 'Apollo Diagnostics Nerul Center',
      riderId: 'rider-priya',
      riderName: 'Priya Nair',
      riderPhone: '+91 98192 33445',
      riderVehicle: 'MH-43-AP-8841',
      status: 'delivered',
      currentStopIndex: 2,
      pickupGeoPoint: toFirestoreGeoPoint(19.0330, 73.0297),
      deliveryGeoPoint: toFirestoreGeoPoint(19.0771, 72.9986),
      pickupLocation: {
        name: 'Apollo Diagnostics Nerul Sector 23',
        address: MUMBAI_LANDMARKS.nerul.address,
        lat: 19.0330,
        lng: 73.0297,
        area: 'Navi Mumbai',
        location: toFirestoreGeoPoint(19.0330, 73.0297)
      },
      deliveryLocation: {
        name: 'Fortis Reference Lab Vashi',
        address: MUMBAI_LANDMARKS.vashi.address,
        lat: 19.0771,
        lng: 72.9986,
        area: 'Navi Mumbai',
        location: toFirestoreGeoPoint(19.0771, 72.9986)
      },
      stopsProgress: [
        {
          stopId: 'stop-nerul-apollo',
          stopName: 'Apollo Diagnostics Nerul Sector 23',
          address: MUMBAI_LANDMARKS.nerul.address,
          lat: 19.0330,
          lng: 73.0297,
          contactPerson: 'Dr. Rajesh Nair',
          phone: '+91 98200 22334',
          status: 'picked_up',
          arrivedAt: `${todayStr}T10:15:00Z`,
          completedAt: `${todayStr}T10:22:00Z`,
          sampleCount: 24,
          photoUrl: photoVial1,
          photoLocation: { lat: 19.0330, lng: 73.0297, accuracy: 6 },
          photoTimestamp: `${todayStr}T10:22:00Z`,
          coldBoxTemp: 3.7,
          notes: '24 EDTA tubes collected for central automated hematology run.'
        }
      ],
      destination: {
        name: 'Fortis Reference Lab Vashi',
        address: MUMBAI_LANDMARKS.vashi.address,
        lat: 19.0771,
        lng: 72.9986,
        arrivedAt: `${todayStr}T10:55:00Z`,
        deliveredAt: `${todayStr}T11:02:00Z`,
        receiverName: 'Dr. Sneha Joshi',
        receiverDesignation: 'Senior Lab Technologist',
        dropPhotoUrl: photoDrop1,
        dropLocation: { lat: 19.0771, lng: 72.9986 },
        dropTimestamp: `${todayStr}T11:02:00Z`,
        coldBoxTempAtDrop: 3.8,
        totalVialsHandedOver: 24,
        notes: 'Handover complete. Temperature verified safe at 3.8°C.'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T09:30:00Z`,
      startedAt: `${todayStr}T10:00:00Z`,
      completedAt: `${todayStr}T11:02:00Z`
    },
    {
      id: `task-${todayStr}-dadar-loop`,
      title: 'Morning Cardiac Biomarkers & Lipid Profile - Dadar',
      type: 'routine_loop',
      priority: 'high',
      assignedRiderId: 'rider-amit',
      area: 'Central & South Mumbai',
      date: todayStr,
      timeSlot: '15:00',
      routeId: 'route-dadar-loop-1',
      routeName: 'Dadar - Mahim Medical Circuit',
      clientId: 'client-dadar-hinduja',
      clientName: 'Hinduja Pathology Satellite Clinic Dadar',
      riderId: 'rider-amit',
      riderName: 'Amit Verma',
      riderPhone: '+91 98765 88990',
      riderVehicle: 'MH-04-EK-9022',
      status: 'pending',
      currentStopIndex: 0,
      pickupGeoPoint: toFirestoreGeoPoint(19.0178, 72.8478),
      deliveryGeoPoint: toFirestoreGeoPoint(19.0320, 72.8390),
      pickupLocation: {
        name: 'Hinduja Satellite Clinic Dadar West',
        address: MUMBAI_LANDMARKS.dadar.address,
        lat: 19.0178,
        lng: 72.8478,
        area: 'Central & South Mumbai',
        location: toFirestoreGeoPoint(19.0178, 72.8478)
      },
      deliveryLocation: {
        name: 'Hinduja Main Processing Lab Mahim',
        address: 'Veer Savarkar Marg, Mahim West, Mumbai 400016',
        lat: 19.0320,
        lng: 72.8390,
        area: 'Central & South Mumbai',
        location: toFirestoreGeoPoint(19.0320, 72.8390)
      },
      stopsProgress: [
        {
          stopId: 'stop-dadar-hinduja',
          stopName: 'Hinduja Satellite Clinic Dadar West',
          address: MUMBAI_LANDMARKS.dadar.address,
          lat: 19.0178,
          lng: 72.8478,
          contactPerson: 'Dr. Farhan Merchant',
          phone: '+91 98200 44556',
          status: 'pending'
        }
      ],
      destination: {
        name: 'Hinduja Main Processing Lab Mahim',
        address: 'Veer Savarkar Marg, Mahim West, Mumbai 400016',
        lat: 19.0320,
        lng: 72.8390,
        notes: 'Scheduled for 15:00 dispatch window.'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T14:00:00Z`
    },
    {
      id: `task-${todayStr}-powai-evening`,
      title: 'Daily Serum & Chemiluminescence Hormone Run - Powai',
      type: 'temperature_critical',
      priority: 'normal',
      assignedRiderId: 'rider-vikram',
      area: 'Eastern Suburbs',
      date: todayStr,
      timeSlot: '14:30',
      routeId: 'route-powai-loop-1',
      routeName: 'Powai - Vikhroli Research Loop',
      clientId: 'client-powai-hiranandani',
      clientName: 'Hiranandani Pathology Research Lab Powai',
      riderId: 'rider-vikram',
      riderName: 'Vikram Patil',
      riderPhone: '+91 98205 77889',
      riderVehicle: 'MH-03-PW-6630',
      status: 'in_transit',
      currentStopIndex: 1,
      pickupGeoPoint: toFirestoreGeoPoint(19.1176, 72.9060),
      deliveryGeoPoint: toFirestoreGeoPoint(19.0600, 72.8620),
      pickupLocation: {
        name: 'Dr. L. H. Hiranandani Hospital Pathology Intake',
        address: MUMBAI_LANDMARKS.powai.address,
        lat: 19.1176,
        lng: 72.9060,
        area: 'Eastern Suburbs',
        location: toFirestoreGeoPoint(19.1176, 72.9060)
      },
      deliveryLocation: {
        name: 'Metropolis Central Reference Lab BKC',
        address: 'Tower B, Parinee Crescenzo, G Block BKC, Mumbai 400051',
        lat: 19.0600,
        lng: 72.8620,
        area: 'Central & South Mumbai',
        location: toFirestoreGeoPoint(19.0600, 72.8620)
      },
      stopsProgress: [
        {
          stopId: 'stop-powai-hiranandani',
          stopName: 'Dr. L. H. Hiranandani Hospital Pathology Intake',
          address: MUMBAI_LANDMARKS.powai.address,
          lat: 19.1176,
          lng: 72.9060,
          contactPerson: 'Dr. Alok Verma',
          phone: '+91 98200 55667',
          status: 'picked_up',
          arrivedAt: `${todayStr}T14:35:00Z`,
          completedAt: `${todayStr}T14:42:00Z`,
          sampleCount: 16,
          photoUrl: photoVial1,
          photoLocation: { lat: 19.1176, lng: 72.9060, accuracy: 4 },
          photoTimestamp: `${todayStr}T14:42:00Z`,
          coldBoxTemp: 3.6,
          notes: 'Specialized hormone serum tubes sealed with cryo-protection packs.'
        }
      ],
      destination: {
        name: 'Metropolis Central Reference Lab BKC',
        address: 'Tower B, Parinee Crescenzo, G Block BKC, Mumbai 400051',
        lat: 19.0600,
        lng: 72.8620,
        coldBoxTempAtDrop: 3.7,
        totalVialsHandedOver: 16,
        notes: 'En-route along JVLR towards BKC hub.'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T13:45:00Z`,
      startedAt: `${todayStr}T14:15:00Z`
    },
    {
      id: `task-${todayStr}-vashi-morning`,
      title: 'Molecular Biology & RT-PCR Specimen Dispatch - Vashi',
      type: 'stat_urgent',
      priority: 'high',
      assignedRiderId: 'rider-rohit',
      area: 'Navi Mumbai',
      date: todayStr,
      timeSlot: '16:00',
      routeId: 'route-vashi-express-1',
      routeName: 'Vashi Sector 17 - Sanpada Expressway',
      clientId: 'client-vashi-fortis',
      clientName: 'Fortis Diagnostics & Collection Hub Vashi',
      riderId: 'rider-rohit',
      riderName: 'Rohit Jadhav',
      riderPhone: '+91 98334 11223',
      riderVehicle: 'MH-43-VS-9912',
      status: 'pending',
      currentStopIndex: 0,
      pickupGeoPoint: toFirestoreGeoPoint(19.0771, 72.9986),
      deliveryGeoPoint: toFirestoreGeoPoint(19.0330, 73.0297),
      pickupLocation: {
        name: 'Fortis Collection Hub Vashi Sector 17',
        address: MUMBAI_LANDMARKS.vashi.address,
        lat: 19.0771,
        lng: 72.9986,
        area: 'Navi Mumbai',
        location: toFirestoreGeoPoint(19.0771, 72.9986)
      },
      deliveryLocation: {
        name: 'Apollo Reference Lab Nerul',
        address: MUMBAI_LANDMARKS.nerul.address,
        lat: 19.0330,
        lng: 73.0297,
        area: 'Navi Mumbai',
        location: toFirestoreGeoPoint(19.0330, 73.0297)
      },
      stopsProgress: [
        {
          stopId: 'stop-vashi-fortis',
          stopName: 'Fortis Collection Hub Vashi Sector 17',
          address: MUMBAI_LANDMARKS.vashi.address,
          lat: 19.0771,
          lng: 72.9986,
          contactPerson: 'Dr. Sneha Joshi',
          phone: '+91 98200 66778',
          status: 'pending'
        }
      ],
      destination: {
        name: 'Apollo Reference Lab Nerul',
        address: MUMBAI_LANDMARKS.nerul.address,
        lat: 19.0330,
        lng: 73.0297,
        notes: 'Scheduled for 16:00 dispatch window.'
      },
      isDelayed: false,
      delayMinutes: 0,
      issueFlags: [],
      createdAt: `${todayStr}T14:30:00Z`
    }
  ];

  // 4. ATTENDANCE RECORDS WITH CHECKIN LOCATION GEOPOINTS
  const attendance: AttendanceRecord[] = [
    {
      id: `att-rider-rahul-${todayStr}`,
      riderId: 'rider-rahul',
      riderName: 'Rahul Sharma',
      date: todayStr,
      checkInTime: '08:30:00',
      checkInLocation: {
        lat: 19.1350,
        lng: 72.8260,
        address: 'Lokhandwala Complex, Andheri West, Mumbai',
        location: toFirestoreGeoPoint(19.1350, 72.8260)
      },
      totalHours: 6.5,
      status: 'on_duty'
    },
    {
      id: `att-rider-sameer-${todayStr}`,
      riderId: 'rider-sameer',
      riderName: 'Sameer Khan',
      date: todayStr,
      checkInTime: '08:45:00',
      checkInLocation: {
        lat: 19.0665,
        lng: 72.8670,
        address: 'G Block, Bandra Kurla Complex (BKC), Mumbai',
        location: toFirestoreGeoPoint(19.0665, 72.8670)
      },
      totalHours: 6.2,
      status: 'on_duty'
    },
    {
      id: `att-rider-priya-${todayStr}`,
      riderId: 'rider-priya',
      riderName: 'Priya Nair',
      date: todayStr,
      checkInTime: '09:00:00',
      checkInLocation: {
        lat: 19.0345,
        lng: 73.0280,
        address: 'Sector 23, Uran Road, Nerul West, Navi Mumbai',
        location: toFirestoreGeoPoint(19.0345, 73.0280)
      },
      checkOutTime: '17:30:00',
      totalHours: 8.5,
      status: 'completed'
    },
    {
      id: `att-rider-amit-${todayStr}`,
      riderId: 'rider-amit',
      riderName: 'Amit Verma',
      date: todayStr,
      checkInTime: '09:15:00',
      checkInLocation: {
        lat: 19.0185,
        lng: 72.8460,
        address: 'Shivaji Park, Dadar West, Mumbai',
        location: toFirestoreGeoPoint(19.0185, 72.8460)
      },
      totalHours: 5.8,
      status: 'present'
    },
    {
      id: `att-rider-vikram-${todayStr}`,
      riderId: 'rider-vikram',
      riderName: 'Vikram Patil',
      date: todayStr,
      checkInTime: '08:50:00',
      checkInLocation: {
        lat: 19.1190,
        lng: 72.9045,
        address: 'Hiranandani Gardens, Central Avenue, Powai, Mumbai',
        location: toFirestoreGeoPoint(19.1190, 72.9045)
      },
      totalHours: 6.1,
      status: 'on_duty'
    },
    {
      id: `att-rider-rohit-${todayStr}`,
      riderId: 'rider-rohit',
      riderName: 'Rohit Jadhav',
      date: todayStr,
      checkInTime: '09:05:00',
      checkInLocation: {
        lat: 19.0760,
        lng: 72.9970,
        address: 'Sector 17 Commercial Hub, Vashi, Navi Mumbai',
        location: toFirestoreGeoPoint(19.0760, 72.9970)
      },
      totalHours: 5.9,
      status: 'present'
    }
  ];

  // 5. LOCATION PINGS
  const locationPings: LocationPing[] = riders.map((r) => ({
    id: `ping-${r.id}-${Date.now()}`,
    riderId: r.id,
    riderName: r.name,
    timestamp: new Date().toISOString(),
    lat: r.currentLocation?.lat || 19.0760,
    lng: r.currentLocation?.lng || 72.8777,
    speed: 28,
    heading: r.currentLocation?.heading || 0,
    battery: r.batteryLevel || 90,
    taskId: tasks.find((t) => t.riderId === r.id)?.id
  }));

  return {
    riders,
    clients,
    tasks,
    attendance,
    locationPings
  };
}

/**
 * Seeds all Mumbai Landmark Data to Firestore directly with batching.
 */
export async function seedMumbaiFirestoreData(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const data = generateMumbaiMockData();
    console.log('[MumbaiSeed] Preparing Firestore Batch Write for Mumbai Landmark Collections...');

    // 1. Batch write to Firestore
    const batch = writeBatch(db);

    // Seed riders
    data.riders.forEach((rider) => {
      const ref = doc(db, 'riders', rider.id);
      batch.set(ref, {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        photoUrl: rider.photoUrl,
        vehicleNumber: rider.vehicleNumber,
        vehicleType: rider.vehicleType,
        assignedRouteIds: rider.assignedRouteIds,
        status: rider.status,
        joiningDate: rider.joiningDate,
        area: rider.area,
        location: rider.currentLocation ? toFirestoreGeoPoint(rider.currentLocation.lat, rider.currentLocation.lng) : null,
        currentLocation: rider.currentLocation
          ? {
              lat: rider.currentLocation.lat,
              lng: rider.currentLocation.lng,
              location: toFirestoreGeoPoint(rider.currentLocation.lat, rider.currentLocation.lng),
              timestamp: rider.currentLocation.timestamp,
              heading: rider.currentLocation.heading,
              accuracy: rider.currentLocation.accuracy
            }
          : null,
        batteryLevel: rider.batteryLevel,
        isOnline: rider.isOnline,
        isCheckedIn: rider.isCheckedIn,
        lastPingTime: rider.lastPingTime
      }, { merge: true });
    });

    // Seed clients
    data.clients.forEach((client) => {
      const ref = doc(db, 'clients', client.id);
      batch.set(ref, {
        id: client.id,
        name: client.name,
        contactPerson: client.contactPerson,
        phone: client.phone,
        email: client.email,
        address: client.address,
        area: client.area,
        lat: client.lat,
        lng: client.lng,
        location: client.lat && client.lng ? toFirestoreGeoPoint(client.lat, client.lng) : null,
        active: client.active,
        createdAt: client.createdAt,
        billingRatePerPickup: client.billingRatePerPickup
      }, { merge: true });
    });

    // Seed tasks
    data.tasks.forEach((task) => {
      const ref = doc(db, 'tasks', task.id);
      batch.set(ref, {
        id: task.id,
        title: task.title,
        type: task.type,
        priority: task.priority,
        assignedRiderId: task.assignedRiderId,
        area: task.area,
        date: task.date,
        timeSlot: task.timeSlot,
        routeId: task.routeId,
        routeName: task.routeName,
        clientId: task.clientId,
        clientName: task.clientName,
        riderId: task.riderId,
        riderName: task.riderName,
        riderPhone: task.riderPhone,
        riderVehicle: task.riderVehicle,
        status: task.status,
        currentStopIndex: task.currentStopIndex,
        pickupGeoPoint: task.pickupGeoPoint,
        deliveryGeoPoint: task.deliveryGeoPoint,
        pickupLocation: task.pickupLocation,
        deliveryLocation: task.deliveryLocation,
        stopsProgress: task.stopsProgress,
        destination: task.destination,
        isDelayed: task.isDelayed,
        delayMinutes: task.delayMinutes,
        issueFlags: task.issueFlags,
        createdAt: task.createdAt,
        startedAt: task.startedAt || null,
        completedAt: task.completedAt || null
      }, { merge: true });
    });

    // Seed attendance
    data.attendance.forEach((att) => {
      const ref = doc(db, 'attendance', att.id);
      batch.set(ref, {
        id: att.id,
        riderId: att.riderId,
        riderName: att.riderName,
        date: att.date,
        checkInTime: att.checkInTime,
        checkInLocation: {
          lat: att.checkInLocation.lat,
          lng: att.checkInLocation.lng,
          address: att.checkInLocation.address,
          location: toFirestoreGeoPoint(att.checkInLocation.lat, att.checkInLocation.lng)
        },
        checkOutTime: att.checkOutTime || null,
        totalHours: att.totalHours || 0,
        status: att.status
      }, { merge: true });
    });

    // Seed locations collection
    data.locationPings.forEach((ping) => {
      const ref = doc(db, 'locations', ping.id);
      batch.set(ref, {
        id: ping.id,
        riderId: ping.riderId,
        riderName: ping.riderName,
        timestamp: ping.timestamp,
        lat: ping.lat,
        lng: ping.lng,
        location: toFirestoreGeoPoint(ping.lat, ping.lng),
        speed: ping.speed,
        heading: ping.heading,
        battery: ping.battery,
        taskId: ping.taskId || null
      }, { merge: true });
    });

    await batch.commit();
    console.log('[MumbaiSeed] Successfully committed all Mumbai mock documents to Firestore!');

    // 2. Also synchronize with local StorageService for immediate instant UI update
    try {
      localStorage.setItem('smvt_riders', JSON.stringify(data.riders));
      localStorage.setItem('smvt_clients', JSON.stringify(data.clients));
      localStorage.setItem('smvt_tasks', JSON.stringify(data.tasks));
      localStorage.setItem('smvt_attendance', JSON.stringify(data.attendance));
      localStorage.setItem('smvt_pings', JSON.stringify(data.locationPings));
    } catch (e) {
      console.warn('[MumbaiSeed] LocalStorage update note:', e);
    }

    const totalCount =
      data.riders.length + data.clients.length + data.tasks.length + data.attendance.length + data.locationPings.length;

    return {
      success: true,
      count: totalCount
    };
  } catch (err: any) {
    console.error('[MumbaiSeed] Firestore batch seeding error:', err);
    return {
      success: false,
      count: 0,
      error: err?.message || String(err)
    };
  }
}
