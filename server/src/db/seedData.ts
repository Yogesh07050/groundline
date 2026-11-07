// First-run content for the fictional demo brand "Nimbus Audio". Once seeded it
// lives in the database and is edited from the console; to onboard a real client,
// replace it there (or import a file) rather than changing this module.
import type { KnowledgeInput } from '../modules/knowledge/schemas.js';
import type { Settings } from '../modules/settings/service.js';

const website = 'https://www.nimbusaudio.example';
const supportEmail = 'support@nimbusaudio.com';

export const seedSettings = (defaults: { temperature: number; maxTokens: number }): Settings => ({
  assistant: {
    name: 'Nio',
    welcomeMessage:
      "Hi! I'm Nio, the Nimbus Audio support assistant. I can help with products, recommendations, " +
      'orders, shipping, and returns. What can I help you find today?',
    suggestions: [
      'What headphones do you recommend for travel?',
      'Compare the Halo ANC and the Studio Pro',
      'What is your return policy?',
      'Do you ship internationally?',
    ],
    model: null,
    temperature: defaults.temperature,
    maxTokens: defaults.maxTokens,
  },
  brand: {
    name: 'Nimbus Audio',
    tagline: 'Sound that disappears. Music that stays.',
    about:
      'Nimbus Audio designs premium wireless headphones, earbuds, and speakers for people who care about ' +
      'how music feels, not just how it looks. Founded in 2018 in Portland, Oregon, we build every product ' +
      'around three ideas: honest sound, all-day comfort, and gear that lasts for years rather than seasons.',
    uniqueSellingPoints: [
      'In-house tuned audio with a signature warm, natural sound profile.',
      'Adaptive Active Noise Cancellation (ANC) on all flagship models.',
      'Industry-leading battery life, with fast-charge on every product.',
      '2-year warranty as standard — double the typical consumer-electronics cover.',
      'Replaceable ear tips, cushions, and (on headphones) batteries to reduce e-waste.',
    ],
    supportEmail,
    supportPhone: '+1 (800) 555-0142',
    supportHours: 'Monday–Friday, 8am–6pm Pacific Time',
    handoffNote: 'A human support specialist can take over any conversation during support hours.',
    website,
    currency: 'USD',
  },
  widget: { accentColor: '#0f5c4a' },
});

type SeedEntry = KnowledgeInput & { id: string };

export const seedEntries: SeedEntry[] = [
  {
    id: 'nimbus-halo-anc',
    type: 'product',
    title: 'Nimbus Halo ANC',
    enabled: true,
    data: {
      category: 'Over-ear headphones',
      price: 299,
      availability: 'In stock',
      colors: ['Midnight Black', 'Cloud White', 'Sage Green'],
      shortDescription:
        'Flagship over-ear wireless headphones with adaptive noise cancellation and 40-hour battery life.',
      highlights: [
        'Adaptive ANC with transparency mode',
        '40-hour battery (ANC on), 60-hour (ANC off)',
        'Fast charge: 10 min = 6 hours playback',
        'Multipoint Bluetooth 5.3 (connect 2 devices)',
        'Replaceable memory-foam ear cushions',
      ],
      specs: {
        driver: '40mm dynamic',
        weight: '278g',
        bluetooth: '5.3',
        codecs: 'SBC, AAC, LDAC',
        batteryLife: '40h (ANC on) / 60h (ANC off)',
        chargingPort: 'USB-C',
        waterResistance: 'None (indoor/commute use)',
        wiredOption: 'Yes, 3.5mm cable included',
      },
      bestFor: 'Travel, commuting, long listening sessions, and home office focus.',
      warranty: '2 years',
    },
  },
  {
    id: 'nimbus-breeze-buds',
    type: 'product',
    title: 'Nimbus Breeze Buds',
    enabled: true,
    data: {
      category: 'Wireless earbuds',
      price: 149,
      availability: 'In stock',
      colors: ['Midnight Black', 'Cloud White'],
      shortDescription:
        'Lightweight ANC earbuds with a secure fit, 8-hour battery, and a pocketable charging case.',
      highlights: [
        'Active noise cancellation + transparency mode',
        '8 hours per charge, 32 hours with the case',
        'IPX5 sweat & water resistance',
        'Wireless charging case',
        'Four ear-tip sizes included',
      ],
      specs: {
        driver: '11mm dynamic',
        weight: '5.1g per bud',
        bluetooth: '5.3',
        codecs: 'SBC, AAC',
        batteryLife: '8h (buds) / 32h (with case)',
        chargingPort: 'USB-C + Qi wireless',
        waterResistance: 'IPX5',
        wiredOption: 'No',
      },
      bestFor: 'Workouts, running, and everyday on-the-go listening.',
      warranty: '2 years',
    },
  },
  {
    id: 'nimbus-sprint-buds',
    type: 'product',
    title: 'Nimbus Sprint Buds',
    enabled: true,
    data: {
      category: 'Wireless earbuds',
      price: 89,
      availability: 'In stock',
      colors: ['Midnight Black', 'Coral'],
      shortDescription:
        'Affordable, no-frills earbuds with a stable fit and solid battery — great as a first pair or a backup.',
      highlights: [
        'Clear, balanced sound (no ANC)',
        '7 hours per charge, 28 hours with the case',
        'IPX4 splash resistance',
        'USB-C fast charge',
        'Low-latency game mode',
      ],
      specs: {
        driver: '10mm dynamic',
        weight: '4.8g per bud',
        bluetooth: '5.2',
        codecs: 'SBC, AAC',
        batteryLife: '7h (buds) / 28h (with case)',
        chargingPort: 'USB-C',
        waterResistance: 'IPX4',
        wiredOption: 'No',
      },
      bestFor: 'Budget-conscious buyers, students, and casual listening.',
      warranty: '2 years',
    },
  },
  {
    id: 'nimbus-studio-pro',
    type: 'product',
    title: 'Nimbus Studio Pro',
    enabled: true,
    data: {
      category: 'Over-ear headphones',
      price: 399,
      availability: 'Pre-order (ships in 3 weeks)',
      colors: ['Graphite'],
      shortDescription:
        'Reference-grade wired/wireless headphones tuned for a flat, accurate response — built for creators.',
      highlights: [
        'Studio-reference tuning (low coloration)',
        'Hi-res wired mode with no latency',
        '35-hour wireless battery',
        'Detachable boom mic included',
        'Swappable velour and leather cushions in the box',
      ],
      specs: {
        driver: '45mm dynamic',
        weight: '310g',
        bluetooth: '5.3',
        codecs: 'SBC, AAC, LDAC',
        batteryLife: '35h wireless',
        chargingPort: 'USB-C',
        waterResistance: 'None',
        wiredOption: 'Yes, USB-C and 3.5mm',
      },
      bestFor: 'Music production, mixing, podcasting, and critical listening.',
      warranty: '2 years',
    },
  },
  {
    id: 'nimbus-pebble-speaker',
    type: 'product',
    title: 'Nimbus Pebble',
    enabled: true,
    data: {
      category: 'Portable speaker',
      price: 119,
      availability: 'In stock',
      colors: ['Midnight Black', 'Sand', 'Ocean Blue'],
      shortDescription:
        'Pocket-sized waterproof Bluetooth speaker with surprisingly big sound and a 18-hour battery.',
      highlights: [
        '360° sound from a palm-sized body',
        '18-hour battery life',
        'IP67 waterproof and dustproof',
        'Stereo pairing with a second Pebble',
        'Built-in strap for bags and bikes',
      ],
      specs: {
        driver: 'Dual 45mm + passive radiator',
        weight: '340g',
        bluetooth: '5.3',
        codecs: 'SBC, AAC',
        batteryLife: '18h',
        chargingPort: 'USB-C',
        waterResistance: 'IP67',
        wiredOption: 'No',
      },
      bestFor: 'Beach, shower, travel, and outdoor hangs.',
      warranty: '2 years',
    },
  },
  {
    id: 'nimbus-grove-home',
    type: 'product',
    title: 'Nimbus Grove',
    enabled: true,
    data: {
      category: 'Home speaker',
      price: 229,
      availability: 'Low stock',
      colors: ['Oak', 'Charcoal'],
      shortDescription:
        'Room-filling home speaker with Wi-Fi + Bluetooth, multi-room support, and a warm, natural tone.',
      highlights: [
        'Wi-Fi streaming + Bluetooth 5.3',
        'Multi-room sync with other Grove units',
        'Room-calibration for balanced sound anywhere',
        'AirPlay 2 and Spotify Connect',
        'Fabric finish that blends into the room',
      ],
      specs: {
        driver: 'Woofer + dual tweeters',
        weight: '1.9kg',
        bluetooth: '5.3',
        codecs: 'SBC, AAC',
        batteryLife: 'Mains powered (no battery)',
        chargingPort: 'AC power',
        waterResistance: 'None',
        wiredOption: 'Aux-in 3.5mm',
      },
      bestFor: 'Living rooms, kitchens, and whole-home audio setups.',
      warranty: '2 years',
    },
  },
  {
    id: 'policy-shipping',
    type: 'policy',
    title: 'Shipping',
    enabled: true,
    data: {
      summary:
        'Free standard shipping on all orders over $75 within the US. Orders under $75 have a flat $5.95 standard shipping fee.',
      details: [
        'Standard shipping (US): 3–5 business days, free over $75.',
        'Express shipping (US): 1–2 business days, $14.95.',
        'Orders placed before 1pm PT on a business day ship the same day.',
        'International shipping: available to Canada, UK, EU, and Australia; 7–14 business days; carrier fees calculated at checkout.',
        'Tracking is emailed as soon as the order leaves our warehouse.',
      ],
    },
  },
  {
    id: 'policy-returns',
    type: 'policy',
    title: 'Returns & Exchanges',
    enabled: true,
    data: {
      summary:
        '30-day no-questions-asked returns. Items must be in working condition with all original accessories. Return shipping is free for US customers.',
      details: [
        'Window: 30 days from the delivery date.',
        'Condition: gently used is fine — include the ear tips/cushions, cable, and case.',
        'Free prepaid return label for US orders; international customers cover return postage.',
        'Exchanges (e.g. different color) are processed as a return + new order and ship immediately.',
        `Start a return at ${website}/returns or email ${supportEmail}.`,
      ],
    },
  },
  {
    id: 'policy-refunds',
    type: 'policy',
    title: 'Refunds',
    enabled: true,
    data: {
      summary:
        'Refunds are issued to the original payment method within 3–5 business days of us receiving the returned item.',
      details: [
        'You receive an email when the refund is initiated.',
        'Original shipping fees (if any) are refunded only for defective or incorrect items.',
        'Pre-order deposits are fully refundable until the item ships.',
      ],
    },
  },
  {
    id: 'policy-payment',
    type: 'policy',
    title: 'Payment',
    enabled: true,
    data: {
      summary:
        'We accept all major cards, PayPal, Apple Pay, Google Pay, and Shop Pay. Pay-in-4 installments are available through Shop Pay at checkout.',
      details: [
        'Cards: Visa, Mastercard, American Express, Discover.',
        'Wallets: PayPal, Apple Pay, Google Pay, Shop Pay.',
        'Installments: 4 interest-free payments via Shop Pay on orders $50–$1,000.',
        'All payments are processed securely; Nimbus Audio never stores full card numbers.',
      ],
    },
  },
  {
    id: 'policy-warranty',
    type: 'policy',
    title: 'Warranty',
    enabled: true,
    data: {
      summary: 'Every Nimbus Audio product comes with a 2-year limited warranty covering manufacturing defects.',
      details: [
        'Covers defects in materials and workmanship for 2 years from purchase.',
        'Does not cover accidental damage, loss, or normal wear of consumables (ear tips).',
        'Replacement ear tips and headphone cushions can be bought separately at any time.',
        `To claim, email ${supportEmail} with your order number and a short description.`,
      ],
    },
  },
  {
    id: 'policy-orderTracking',
    type: 'policy',
    title: 'Order Tracking & Changes',
    enabled: true,
    data: {
      summary:
        'Track your order from the link in your shipping email, or your account dashboard. We can change or cancel an order until it ships.',
      details: [
        'Tracking link is in the "Your order shipped" email.',
        'Address changes/cancellations: contact us before the order ships (usually within a few hours).',
        'Once shipped, an order cannot be redirected but can be returned on arrival.',
      ],
    },
  },
  {
    id: 'faq-0',
    type: 'faq',
    title: 'Do your headphones work with iPhone and Android?',
    enabled: true,
    data: {
      answer:
        'Yes. All Nimbus Audio products use standard Bluetooth and work with iPhone, Android, tablets, laptops, and anything else that supports Bluetooth audio.',
    },
  },
  {
    id: 'faq-1',
    type: 'faq',
    title: 'Can I connect to two devices at once?',
    enabled: true,
    data: {
      answer:
        'The Nimbus Halo ANC and Nimbus Studio Pro support multipoint, so you can stay connected to two devices (for example a laptop and a phone) at the same time.',
    },
  },
  {
    id: 'faq-2',
    type: 'faq',
    title: 'Which product is best for the gym or running?',
    enabled: true,
    data: {
      answer:
        'The Nimbus Breeze Buds (IPX5) are our recommendation for workouts thanks to their secure fit and sweat resistance. The Sprint Buds (IPX4) are a lighter-budget option.',
    },
  },
  {
    id: 'faq-3',
    type: 'faq',
    title: 'Do you offer student or bulk discounts?',
    enabled: true,
    data: {
      answer:
        'We run seasonal promotions that are announced by email and on our website. We do not have a standing student or bulk discount program, so pricing shown is current.',
    },
  },
  {
    id: 'faq-4',
    type: 'faq',
    title: 'Are the batteries replaceable?',
    enabled: true,
    data: {
      answer:
        'Headphone cushions and earbud tips are replaceable by the customer. The internal batteries in our over-ear headphones can be replaced by our service team for a fee after the warranty period — contact support for details.',
    },
  },
  {
    id: 'faq-5',
    type: 'faq',
    title: 'Is there a mobile app?',
    enabled: true,
    data: {
      answer:
        'Yes, the free Nimbus app (iOS and Android) lets you adjust EQ, toggle noise cancellation levels, and install firmware updates. It is optional — the products work fully without it.',
    },
  },
  {
    id: 'faq-6',
    type: 'faq',
    title: 'How do I pair my headphones for the first time?',
    enabled: true,
    data: {
      answer:
        'Hold the power button for about 3 seconds until the light flashes blue, then pick the product name from the Bluetooth menu on your phone or computer. After the first pairing it reconnects automatically.',
    },
  },
  {
    id: 'faq-7',
    type: 'faq',
    title: 'What is your sound signature like?',
    enabled: true,
    data: {
      answer:
        'Our house sound is warm and natural with a slight low-end lift — enjoyable for most genres without being boomy. The Studio Pro is the exception: it is tuned flat for accurate, reference listening.',
    },
  },
];
