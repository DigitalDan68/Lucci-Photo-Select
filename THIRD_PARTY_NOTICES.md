# Bundled imaging components

RAW decoding uses LibRaw-Wasm 1.6.0 (ISC wrapper) and its bundled LibRaw engine. LibRaw is available under LGPL 2.1 or CDDL 1.0. Source and build instructions: https://github.com/ybouane/LibRaw-Wasm and https://www.libraw.org/ . The WASM is shipped separately and can be replaced with a compatible rebuilt version.

Face and eye landmarks use TensorFlow.js and the TensorFlow BlazeFace model under Apache 2.0. Source: https://github.com/tensorflow/tfjs-models/tree/master/blazeface . Model files are bundled for offline use; no photos are sent to a server. Detection is not identity recognition.

Metadata uses exifr (MIT); image processing uses sharp (Apache 2.0) and libvips (LGPL 2.1). Dependency packages retain their own license files.
