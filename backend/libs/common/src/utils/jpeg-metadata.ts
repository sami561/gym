import { BadRequestException } from '@nestjs/common';
import { PHOTO_ERRORS } from '../contracts/photo.contracts';

/*
 * Shared by every photo upload (member photos in membership-service, coach photos in auth-service).
 *
 * JPEG layout (ITU-T T.81, annex B): SOI `FF D8`, then marker segments `FF xx <length:2> <payload>` (the
 * length counts itself, any number of `FF` fill bytes may come before a marker), a frame header (SOFn), and
 * scans: a SOS header followed by entropy-coded data in which `FF` is always followed by `00` (stuffing) or
 * by a restart marker `D0`–`D7`. Progressive files have several scans with table segments between them.
 * EOI `FF D9` ends the image.
 */
const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;
const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7;
/** APP1–APP15 (EXIF and its GPS block and thumbnail, XMP, ICC, IPTC…) and COM: never needed to show the image. */
const isMetadata = (marker: number) => (marker >= 0xe1 && marker <= 0xef) || marker === COM;
/** SOF0–SOF15, except C4 (DHT), C8 (JPG) and CC (DAC) which share the range. */
const isFrameHeader = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

const notJpeg = () => new BadRequestException(PHOTO_ERRORS.notJpeg);

/**
 * The JPEG without its metadata segments: APP1–APP15 and COM are removed wherever they are (before the first
 * scan or between the scans of a progressive file) and whatever follows the end-of-image marker is dropped
 * (data some phones append there: second images, motion-photo videos). Everything else is kept byte for
 * byte: APP0 (JFIF), the tables, the frame and scan headers, and the image data, copied without being decoded.
 *
 * Throws 400 `La photo doit être une image JPEG.` unless the bytes are a well-formed JPEG: SOI, segments with
 * consistent lengths, a frame header before the first scan, valid frame and scan headers, an EOI marker.
 */
export function stripJpegMetadata(jpeg: Buffer): Buffer {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== SOI || jpeg[2] !== 0xff) throw notJpeg();
  const kept: Buffer[] = [jpeg.subarray(0, 2)];
  let pos = 2;
  let frame = false;
  let scanning = false;

  for (;;) {
    if (scanning) {
      const end = endOfScanData(jpeg, pos);
      kept.push(jpeg.subarray(pos, end));
      pos = end;
    }
    const start = pos;
    if (jpeg[pos] !== 0xff) throw notJpeg();
    while (jpeg[pos] === 0xff) pos++;
    if (pos >= jpeg.length) throw notJpeg();
    const marker = jpeg[pos++];

    if (marker === EOI) {
      if (!scanning) throw notJpeg();
      kept.push(jpeg.subarray(start, pos));
      return Buffer.concat(kept);
    }
    // Markers without a length (SOI, RSTn, TEM) or reserved (02–BF) have nothing to do here.
    if (marker < 0xc0 || marker === SOI || isRestart(marker)) throw notJpeg();
    if (pos + 2 > jpeg.length) throw notJpeg();
    const length = jpeg.readUInt16BE(pos);
    const end = pos + length;
    if (length < 2 || end > jpeg.length) throw notJpeg();

    if (isFrameHeader(marker)) {
      // Lf P Y X Nf, then 3 bytes per component; a width of 0 cannot be shown.
      if (length < 8 || jpeg[pos + 7] < 1 || length !== 8 + 3 * jpeg[pos + 7] || jpeg.readUInt16BE(pos + 5) === 0) {
        throw notJpeg();
      }
      frame = true;
    } else if (marker === SOS) {
      // Ls Ns, then 2 bytes per component (1 to 4) and 3 bytes of spectral selection / approximation.
      if (!frame || length < 3 || jpeg[pos + 2] < 1 || jpeg[pos + 2] > 4 || length !== 6 + 2 * jpeg[pos + 2]) {
        throw notJpeg();
      }
      scanning = true;
    }
    if (!isMetadata(marker)) kept.push(jpeg.subarray(start, end));
    pos = end;
  }
}

/**
 * Where the entropy-coded data starting at `from` ends: the first byte (fill bytes included) of the next
 * marker that is neither a stuffed `FF 00` nor a restart marker. Refuses data cut short before a marker.
 */
function endOfScanData(jpeg: Buffer, from: number): number {
  let pos = from;
  for (;;) {
    const ff = jpeg.indexOf(0xff, pos);
    if (ff < 0) throw notJpeg();
    let code = ff + 1;
    while (jpeg[code] === 0xff) code++;
    if (code >= jpeg.length) throw notJpeg();
    if (jpeg[code] !== 0x00 && !isRestart(jpeg[code])) return ff;
    pos = code + 1;
  }
}
