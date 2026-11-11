export interface SiteContact {
  name: string;
  email?: string;
  phone?: string;
  phoneLink?: string;
  address?: string;
  hours?: string;
  responseTime?: string;
  facebookUrl?: string;
  instagramUrl?: string;
}

export interface SiteContent {
  name: string;
  description: string;
  contacts: SiteContact[];
  privacy?: string;
  terms?: string;
  copyrightOwner?: string;
}

/** Replace these placeholders. Delete a contact property or leave it blank to hide it.
 * Add full https:// URLs to facebookUrl/instagramUrl; blank fields hide the logos.
 * phoneLink is optional: without it the phone is displayed as plain text. */
export const siteContent: SiteContent = {
  name: 'Tri-City Drop-In Soccer',
  description: 'Community soccer, shared pitches, and a place for everyone to play.',
  contacts: [{
    name: 'Korbin Kovac',
    facebookUrl: 'https://www.facebook.com/KorbinAnthonyKovac',
    instagramUrl: 'https://www.instagram.com/korbinanthony/',
    email: 'KorbinKovac21@gamil.com',
    phone: '(989) 576-2818',
    phoneLink: '+19895762818',
  },
  {
    name: 'Kolton Kovac',
    facebookUrl: 'https://www.facebook.com/kolton.kovac/',
    instagramUrl: 'https://www.instagram.com/kbnotlok/',
    email: 'kovackolton@gamil.com',
    phone: '(989) 576-2819',
    phoneLink: '+19895762819',
  },
  // Add more named contacts here, for example:
  // { name: 'Venue bookings', email: 'bookings@example.com', phone: '', hours: '' },
  ] as SiteContact[],
  // privacy: 'Privacy policy: [add policy text or a link]',
  // terms: 'Terms of use: [add terms text or a link]',
  copyrightOwner: 'Tri-City Drop-In Soccer',
};
