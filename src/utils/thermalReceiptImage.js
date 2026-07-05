// Captures a hidden, off-screen receipt View (see
// src/components/print/ReceiptPrintable.js) into a PNG and wraps it as the
// @finan-me/react-native-thermal-printer document node array for a print job.
//
// This replaces the old ESC/POS text-node documents (buildInvoiceReceiptDocument
// / buildInvoiceListReceiptDocument in thermalReceipt.js) for the real print
// buttons, because the printer has no working UTF-8/Arabic font support in
// text mode - see the long comment in ReceiptPrintable.js for the full story.
//
// The library's printer.ts (`printCore`) correctly special-cases 'image'
// document nodes: it calls NativePrinter.printImage(...) directly for them
// (not the ESC/POS byte compiler, which explicitly skips image nodes) and
// cleans up the temp file afterward, so mixing an image node with trailing
// feed/cut nodes in the same document array works as expected.

import { captureRef } from 'react-native-view-shot'
import { RECEIPT_IMAGE_WIDTH_PX } from '../components/print/ReceiptPrintable'

// Captures the given ref (a receipt View) to a PNG sized to exactly the
// printer's printable dot width, so there is a 1:1 pixel mapping and no
// resampling surprises from device pixel density.
export async function captureReceiptImage(viewRef) {
  if (!viewRef) {
    throw new Error('Receipt view is not ready to capture yet.')
  }

  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: RECEIPT_IMAGE_WIDTH_PX,
  })

  return [
    { type: 'image', imagePath: uri, options: { widthPx: RECEIPT_IMAGE_WIDTH_PX, align: 'center' } },
    { type: 'feed', lines: 3 },
    { type: 'cut' },
  ]
}
