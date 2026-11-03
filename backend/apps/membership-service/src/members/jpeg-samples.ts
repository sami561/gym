/**
 * Hand-built JPEG pieces for the specs (jpeg-metadata, member-photos). The structure is a real JPEG
 * (segments, frame and scan headers, entropy-coded data with stuffed bytes and restart markers); the image
 * data itself is not a picture. Not used by the service.
 */

/** `FF <marker> <length> <payload>`, the length counting its own two bytes. */
export function segment(marker: number, payload: number[] | Buffer): Buffer {
  const body = Buffer.from(payload);
  const out = Buffer.alloc(4 + body.length);
  out[0] = 0xff;
  out[1] = marker;
  out.writeUInt16BE(body.length + 2, 2);
  body.copy(out, 4);
  return out;
}

const ascii = (text: string) => [...Buffer.from(text, 'latin1')];

export const SOI = Buffer.from([0xff, 0xd8]);
export const EOI = Buffer.from([0xff, 0xd9]);
/** APP0 JFIF 1.01, no thumbnail. */
export const JFIF = segment(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
export const DQT = segment(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => i + 1)]);
/** Baseline frame: 8 bits, 600×600, 3 components. */
export const SOF0 = segment(0xc0, [8, 0x02, 0x58, 0x02, 0x58, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
export const DHT = segment(0xc4, [0x00, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, ...Array.from({ length: 12 }, (_, i) => i)]);
export const SOS = segment(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
/** Entropy-coded data: a stuffed FF (FF 00) and restart markers (FF D0, FF D7) belong to the image data. */
export const SCAN_DATA = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a, 0xff, 0x00, 0xff, 0xd7, 0xbc, 0xde]);

/** Latitude 35°50'44.16" N, longitude 10°37'4.08" E (the gym, Sousse) as EXIF rationals. */
export const GPS_LATITUDE = rationals([35, 1], [50, 1], [4416, 100]);
export const GPS_LONGITUDE = rationals([10, 1], [37, 1], [408, 100]);

function rationals(...values: [number, number][]): Buffer {
  const out = Buffer.alloc(values.length * 8);
  values.forEach(([numerator, denominator], i) => {
    out.writeUInt32BE(numerator, i * 8);
    out.writeUInt32BE(denominator, i * 8 + 4);
  });
  return out;
}

/**
 * APP1 EXIF as a phone writes it: TIFF header, IFD0 with Make and the GPS IFD pointer, and a GPS IFD with
 * latitude and longitude (big-endian, offsets from the TIFF header).
 */
export function exifWithGps(): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 8 + 2 + 4 * 12 + 4 + 24 + 24);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  const entry = (at: number, tag: number, type: number, count: number, value: number | string) => {
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(type, at + 2);
    tiff.writeUInt32BE(count, at + 4);
    if (typeof value === 'string') tiff.write(value, at + 8, 'latin1');
    else tiff.writeUInt32BE(value, at + 8);
  };
  // IFD0 at 8: Make (ASCII, stored after the IFD) and GPSInfo → GPS IFD.
  const make = 8 + 2 + 2 * 12 + 4;
  const gps = make + 8;
  tiff.writeUInt16BE(2, 8);
  entry(10, 0x010f, 2, 6, make);
  entry(22, 0x8825, 4, 1, gps);
  tiff.writeUInt32BE(0, 34);
  tiff.write('Apple\0', make, 'latin1');
  // GPS IFD: LatitudeRef, Latitude, LongitudeRef, Longitude.
  const latitude = gps + 2 + 4 * 12 + 4;
  const longitude = latitude + 24;
  tiff.writeUInt16BE(4, gps);
  entry(gps + 2, 0x0001, 2, 2, 'N\0');
  entry(gps + 14, 0x0002, 5, 3, latitude);
  entry(gps + 26, 0x0003, 2, 2, 'E\0');
  entry(gps + 38, 0x0004, 5, 3, longitude);
  tiff.writeUInt32BE(0, gps + 50);
  GPS_LATITUDE.copy(tiff, latitude);
  GPS_LONGITUDE.copy(tiff, longitude);
  return segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]));
}

/** XMP packet (APP1), with a location and the device. */
export const XMP = segment(0xe1, [
  ...ascii('http://ns.adobe.com/xap/1.0/\0'),
  ...ascii('<x:xmpmeta><exif:GPSLatitude>35,50.736N</exif:GPSLatitude><tiff:Model>iPhone</tiff:Model></x:xmpmeta>'),
]);
export const ICC = segment(0xe2, [...ascii('ICC_PROFILE\0'), 1, 1, ...Array.from({ length: 32 }, () => 0x2a)]);
export const IPTC = segment(0xed, [...ascii('Photoshop 3.0\0'), ...ascii('8BIM'), 0x04, 0x04, 0, 0, 0, 0, 0, 0]);
export const ADOBE = segment(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
export const APP15 = segment(0xef, ascii('private'));
export const COMMENT = segment(0xfe, ascii('Photo de Amira, salle Meliora'));

/** A baseline JPEG as a phone camera writes it: JFIF, EXIF with GPS, a comment, then the image. */
export function cameraJpeg(): Buffer {
  return Buffer.concat([SOI, JFIF, exifWithGps(), COMMENT, DQT, SOF0, DHT, SOS, SCAN_DATA, EOI]);
}

/** cameraJpeg() once cleaned: the same bytes without the EXIF and comment segments. */
export function cleanJpeg(): Buffer {
  return Buffer.concat([SOI, JFIF, DQT, SOF0, DHT, SOS, SCAN_DATA, EOI]);
}

export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
