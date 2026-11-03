import { BadRequestException } from '@nestjs/common';
import { stripJpegMetadata } from './jpeg-metadata';
import {
  ADOBE,
  APP15,
  COMMENT,
  DHT,
  DQT,
  EOI,
  GPS_LATITUDE,
  GPS_LONGITUDE,
  ICC,
  IPTC,
  JFIF,
  PNG,
  SCAN_DATA,
  SOF0,
  SOI,
  SOS,
  XMP,
  cameraJpeg,
  cleanJpeg,
  exifWithGps,
  segment,
} from './jpeg-samples';

const NOT_JPEG = new BadRequestException('La photo doit être une image JPEG.');
const jpeg = (...parts: Buffer[]) => Buffer.concat(parts);
const contains = (haystack: Buffer, needle: Buffer | string) => haystack.includes(needle);

describe('stripJpegMetadata', () => {
  describe('removes the metadata', () => {
    it('drops the EXIF segment with its GPS block and keeps the rest byte for byte', () => {
      const input = cameraJpeg();
      expect(contains(input, GPS_LATITUDE) && contains(input, 'Exif')).toBe(true);

      const output = stripJpegMetadata(input);

      expect(output).toEqual(cleanJpeg());
      for (const leak of [GPS_LATITUDE, GPS_LONGITUDE, 'Exif', 'Apple', 'Photo de Amira']) {
        expect(contains(output, leak)).toBe(false);
      }
    });

    it('copies the image data unchanged, stuffed bytes and restart markers included', () => {
      const output = stripJpegMetadata(cameraJpeg());
      const start = output.indexOf(SOS) + SOS.length;
      expect(output.subarray(start, start + SCAN_DATA.length)).toEqual(SCAN_DATA);
      expect(output.subarray(-2)).toEqual(EOI);
    });

    it('drops APP1–APP15 and comments, keeps APP0 (JFIF) and the tables in their order', () => {
      const input = jpeg(SOI, JFIF, XMP, ICC, IPTC, ADOBE, APP15, COMMENT, DQT, SOF0, DHT, SOS, SCAN_DATA, EOI);
      expect(stripJpegMetadata(input)).toEqual(jpeg(SOI, JFIF, DQT, SOF0, DHT, SOS, SCAN_DATA, EOI));
    });

    it('drops the metadata between the scans of a progressive JPEG', () => {
      const sof2 = Buffer.from(SOF0);
      sof2[1] = 0xc2;
      const input = jpeg(SOI, JFIF, DQT, sof2, DHT, SOS, SCAN_DATA, exifWithGps(), DHT, SOS, SCAN_DATA, COMMENT, EOI);
      expect(stripJpegMetadata(input)).toEqual(jpeg(SOI, JFIF, DQT, sof2, DHT, SOS, SCAN_DATA, DHT, SOS, SCAN_DATA, EOI));
    });

    it('drops whatever follows the end of the image (a second image with its own EXIF)', () => {
      const input = jpeg(cleanJpeg(), cameraJpeg(), Buffer.from('trailer'));
      expect(stripJpegMetadata(input)).toEqual(cleanJpeg());
    });

    it('keeps fill bytes before a kept marker and drops them with a removed segment', () => {
      const fill = Buffer.from([0xff, 0xff]);
      const input = jpeg(SOI, JFIF, fill, exifWithGps(), fill, DQT, SOF0, DHT, SOS, SCAN_DATA, fill, EOI);
      expect(stripJpegMetadata(input)).toEqual(jpeg(SOI, JFIF, fill, DQT, SOF0, DHT, SOS, SCAN_DATA, fill, EOI));
    });

    it('returns a JPEG without metadata as it is', () => {
      expect(stripJpegMetadata(cleanJpeg())).toEqual(cleanJpeg());
    });
  });

  describe('refuses what is not a well-formed JPEG', () => {
    const refused = (bytes: Buffer) => expect(() => stripJpegMetadata(bytes)).toThrow(NOT_JPEG);

    it('refuses other formats and text, whatever their declared type', () => {
      refused(PNG);
      refused(Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'));
      refused(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
      refused(Buffer.alloc(0));
    });

    it('refuses a file cut short', () => {
      const full = cameraJpeg();
      refused(full.subarray(0, 2));
      refused(full.subarray(0, 3));
      // inside the EXIF segment (its length runs past the end), inside the SOS header, inside the image data
      refused(full.subarray(0, SOI.length + JFIF.length + 20));
      refused(full.subarray(0, full.indexOf(SOS) + 5));
      refused(full.subarray(0, full.length - 4));
      // without its EOI marker, or ending in the middle of a marker
      refused(full.subarray(0, full.length - 2));
      refused(full.subarray(0, full.length - 1));
    });

    it('refuses a JPEG without image', () => {
      refused(jpeg(SOI, JFIF, DQT, SOF0, EOI));
      refused(jpeg(SOI, EOI));
    });

    it('refuses a scan before the frame header', () => {
      refused(jpeg(SOI, JFIF, DQT, DHT, SOS, SCAN_DATA, EOI));
    });

    it('refuses bad segment lengths and headers', () => {
      const tooShort = Buffer.from([0xff, 0xdb, 0x00, 0x01]);
      refused(jpeg(SOI, tooShort, SOF0, SOS, SCAN_DATA, EOI));
      const badFrame = segment(0xc0, [8, 0x02, 0x58, 0x02, 0x58, 3, 1, 0x22, 0]);
      refused(jpeg(SOI, badFrame, SOS, SCAN_DATA, EOI));
      const noWidth = segment(0xc0, [8, 0x02, 0x58, 0, 0, 1, 1, 0x11, 0]);
      refused(jpeg(SOI, noWidth, SOS, SCAN_DATA, EOI));
      const noComponent = segment(0xda, [0, 0, 63, 0]);
      refused(jpeg(SOI, SOF0, noComponent, SCAN_DATA, EOI));
    });

    it('refuses bytes between segments and markers that do not belong there', () => {
      refused(jpeg(SOI, Buffer.from([0x00]), JFIF, DQT, SOF0, DHT, SOS, SCAN_DATA, EOI));
      refused(jpeg(SOI, Buffer.from([0xff, 0x02, 0x00, 0x04, 0, 0]), SOF0, SOS, SCAN_DATA, EOI));
      refused(jpeg(SOI, Buffer.from([0xff, 0xd0]), SOF0, SOS, SCAN_DATA, EOI));
      refused(jpeg(SOI, SOI, SOF0, SOS, SCAN_DATA, EOI));
      refused(jpeg(SOI, SOF0, SOS, SCAN_DATA, SOI, EOI));
    });
  });
});
