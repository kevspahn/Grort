import { describe, expect, it } from 'vitest';
import { parseReceiptJsonResponse, ReceiptParseError } from './parseResponse';

describe('parseReceiptJsonResponse', () => {
  it('parses plain JSON', () => {
    expect(parseReceiptJsonResponse('{"ok":true}')).toEqual({ ok: true });
  });

  it('parses fenced JSON', () => {
    expect(parseReceiptJsonResponse('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('classifies non-receipt responses', () => {
    expect(() =>
      parseReceiptJsonResponse('This appears to be a logo or icon rather than a receipt.')
    ).toThrow(ReceiptParseError);
  });

  it('classifies non-receipt responses that describe missing receipt text', () => {
    expect(() =>
      parseReceiptJsonResponse(
        "I don't see a grocery receipt in the image. There is no receipt text visible."
      )
    ).toThrow(ReceiptParseError);
  });

  it('classifies non-receipt responses that mention no visible text', () => {
    expect(() =>
      parseReceiptJsonResponse(
        'I cannot identify any grocery receipt content in this image. There is no visible text.'
      )
    ).toThrow(ReceiptParseError);
  });

  it('classifies non-receipt narrative responses about logos and missing text', () => {
    expect(() =>
      parseReceiptJsonResponse(
        "I don't see a grocery receipt here. The image looks like a geometric design with no text or receipt content."
      )
    ).toThrow(ReceiptParseError);
  });
});
