/**
 * bit-sync.js
 *
 * This is a simple utility to synchronize two pieces of data, the source and the destination, using the rsync algorithm. The reason you might want
 * to use this utility rather than just copying the source to the destination is to save on bandwidth. The rsync algorithm is really clever
 * about only sending the parts of the file that have changed, rather than the whole file. For small files, this isn't that important, but
 * when you start dealing with modifications to files that are tens or hundreds of megs in size, it's a pretty big deal.
 *
 * This is a pure javascript implementation of the rsync algorithm, meaning it can be used pretty much anywhere and doesn't have any dependencies - so
 * feel free to use it in the browser or in nodejs, or wherever. For convenience, it's available in both npm and bower (see installation instructions below).
 *
 * Some example use cases might be in a collaborative image or video editing application where a series of small modifications are made to relatively
 * large files. It's way nicer to just send the changed bits than to make your user wait around until large files finish uploading and downloading. It
 * also saves a ton of bandwidth.
 *
 * The source and destination data must be of the same type, but can be pretty much any array-like object that javascript supports.
 *
 * Particular attention is paid to ArrayBuffers, though it is up to the application to ensure that endianess is consistent between the
 * source and destination.
 *
 * This utility is intentionally transport agnostic. The intent is that it will be equally useful for local comparisons, http, socket.io, or webRTC -
 * in browser-to-browser, browser-to-node, or node-to-node scenarios. To support http-like transports where binary data can be problematic, 
 * the generated documents can base64 encoded.
 *
 * Additionally, no assumption is made as to the source of the data - it should be equally useful for synching files, memcached binaries, database blobs, or
 * anything else.
 *
 * How it works
 * ------------
 * 
 * The mechanism used for synchronization is the famous rsync algorithm developed by Andrew Tridgell (http://rsync.samba.org/tech_report/)
 *
 * In a nutshell, what happens is that there are, somewhere, two pieces of data that needs to be synchronized, a source and a destination.
 *
 * We're able to synchronize them in a single rountrip. 
 *
 * First, some information is generated about the destination data. This information contains checksum info for each block of size S in the destination data. We'll call this 
 * the "checksum document". For performance reasons, it's wise to cache this document and only regenerate it when the destination data has changed. This utility doesn't do
 * any caching itself, so if you'd like to cache just generate a checksum document and store it in your favorite place. Preferablly gzipped, if you want to save some 
 * bandwith and space.
 *
 * When the source wants to synchronize to the destination, a request for the checksum document is made. The source uses this checksum document to scan through itself and detect
 * changes. It then creates a new document called the "patch instructions". This document is given to the destination, and used to modify the destination so that it looks
 * exactly like the source.
 *
 * Usage
 * -----
 * 
 * A fair amount of effort was made to keep the api for the synchronization process very simple. So simple, in fact, that there are only three functions!
 *
 * The three functions you will use are: createChecksumDocument, createPatchDocument, applyPatch. In NodeJS, these functions are just exported. In the browser, the BSync namespace is used (i.e. BSync.createChecksumDocument(...) ).
 * There isn't any magic going on inside of them, and they don't need any fancy "this" context, so feel free to pass them around or alias them however you like, you won't hurt anything.
 *
 * The hairy details are below, but basically all you need to do is call createChecksumDocument on the destination data, send that document to the source data somehow, then call
 * createPatchDocument on the source data using the checksum document you just sent. Last step is to send the patch document back to the destination, and call applyPatch. That's it. After
 * you complete those three calls, the destination data will look just like the source data, but you've drastically reduced your bandwith usage over a straight copy.
 *
 * The only parts where this might get a bit annoying is in the transport itself. The createChecksumDocument and createPatchDocument both return binary data in an ArrayBuffer. The reason for this
 * is to reduce transmission size as much as possible (that's the whole point of rsync, right?). This can be problematic for httpish transports, so to deal with this
 * it is recommended that the returned ArrayBuffer be base64 encoded prior to sending. For sockety transports, the raw binary document is probably better, it'll save about 30% bandwidth. Most modern
 * browsers support xhr2 which allows posting of binary data from js, so if you don't need to support ie 9 and below, you're in good shape to just send this natively. Mostly, if you're using this
 * to sync up data from the Web Audio API or some other fancy thing, you're going to be browser restricted anyway.
 *
 * Downstream libraries that utilize bit-sync might want to make the life of the developer a little easier by detecting the transport mechanism and doing some automatic encoding. In order to keep this utility
 * as generic as possible, encoding and transport details are left to downstream consumers/libraries.
 *
 * function createChecksumDocument(blockSize, data)
 *
 * This function will create the checksum document for the destination data. This is what the source uses to determine what's changed. It accepts two 
 * parameters: blockSize and data. The document that's generated is an ArrayBuffer of binary data. It's important to note that this function call is slow! Both adler32 and md5sums are generated
 * for each block in the data. For 10s of megs of data, this can easily take a few seconds. You'll want to cache this document and only regenerate it when needed.
 *
 * The blocksize parameter is just the size of the "chunks" you want to use to generate checksums. This really depends on the size of your data. Algorimically, there are some
 * tradeoffs here between computation speed and false first-pass hits, if you want to know more about it read Andrew Tridgell's paper on rsync. If you're not sure, don't care,
 * or are too busy, just try a value of 1000 for this. If your data isn't that big, the utility will adjust it for you. 
 *
 * When you're considering what to use for the block size, there's also a tradeoff in terms of the size of the checksum document and the patch document. For each block in the data, 20 bytes of checksum
 * data is created, 4 bytes for a fast adler32 checksum and 16 bytes for a md5sum. If you have 20 megs of data to sync, and you pick a block size of 1000 bytes, you're going to end up with a checksum document
 * that's around 400k. Depending on your application this might be appropriate, because the granularity of updated blocks will be smaller, only 1k. So, when something changes, only a 1k block will be sent in the 
 * patch document. On the other hand, if you chose a block size of 10k, your checksum document will only be about 40k - however each changed block will be much larger, so a single byte change would result in
 * a 10k update over the wire. Again, this tradeoff really depends on your application and how your users modify data.
 *
 * The data parameter is the destination data you want to synchronize. This can be pretty much any array-like type that javascript supports. Strings, arrays and ArrayBuffers are all
 * fine. ArrayBuffers will be iterated over using a Uint8Array view, so pay attention to the endianness of your data, this utility makes no attempt to correct mismatched endianness.
 *
 * function createPatchDocument(checksumDocument, data)
 *
 * This will create the patch document that is used to actually apply the changes to the destination data. Depending on the differences between the source and the destination, this file
 * could end up being pretty large, so you might want to try compressing it. It only needs two parameters: the checksumDocument created by the createChecksumDocument() function, and the 
 * source data. The patch document that's created by this call should be applied to the destination data with the applyPatch call. Again, this document will be an ArrayBuffer.
 * 
 * function applyPatch(patchDocument, data)
 * 
 * This applies the changes in the patchDocument to the destination data, bringing it into synchronization with the source data. The patch document should have been created by a call to 
 * createPatchDocument() on the source data. It takes two parameters as well, the patch document to apply, and the destination data to apply it to.
 *
 * Installation
 * ------------
 * 
 * For node, just npm install bit-sync. For the browser, if you're using bower you can do bower install bit-sync and add the appropriate script tag.
 * If you're not using a fancy package manager, no worries, it's only a single file. Just download bit-sync.js and include it however you like.
 *
 * In node, the three api functions are exported from the module, so just do something like ds = require("bit-sync"); ds.createChecksumDocument(...);
 *
 * In the browser, we're using the BSync namespace, so BSync.createPatchDocument(...); should work.
 *
 * Current source can always be obtained from https://github.com/claytongulick/bit-sync.git
 *
 * Notes on updates and use
 * ------------------------
 * 
 * This is one of those libraries that probably won't be updated very often, really only for bug fixes or optimizations (like, if some new browser-native stuff comes out, like a native md5 function, for example). 
 * If you're looking at github and see that it's been years and years since an update, don't worry about it - this is intended to be a simple, stable utility that doesn't change much, and really intended for use 
 * within other larger projects or libraries. 
 *
 * If you decide to use this in your project or library, great! Would you mind sending me a note letting me know? I'd love to see how folks are using it. I'd also be happy to add a link to your project
 * here, if you'd like.
 *
 * If you find a bug, please file an issue at https://github.com/claytongulick/bit-sync/issues
 *
 * Tests
 * -----
 * Making sure everything works correctly with data synchronization is sort of important, so comprehensive test coverage exists both in the browser and for node.
 * The unit testing framework of choice is QUnit - chosen for it's simplicity and ability to work easily in both the browser and node.
 *
 * To run tests from node, just do: npm test
 *
 * To run tests in the browser, just point your browser at tests/index.html - this won't work from the local file system, you'll need to host it on some sort of server.
 *
 * Internal functions are tested independently, and for that purpose are exposed via the util object in the BSync namespace. For example, BSync.util.adler32(...) .
 *
 * It's not recommended to directly execute any function in the util object, since these internal functions probably won't have a stable api and might change depending on what sort of native 
 * support the browses offer over time.
 *
 * Credits and Thanks
 * ------------------
 * Of course, most credit goes to Andrew Tridgell for rsync and for being awesome.
 * Also, credit for the native js implementation of md5 goes to Luigi Galli - LG@4e71.org - http://faultylabs.com - who is also awesome and placed his md5 implementation in the public domain.
 */

var BSync = new function()
{

  /******* Privates *********/
  /**
   * Native js md5 implementation. Written by by Luigi Galli - LG@4e71.org - http://faultylabs.com
   * Modified by Clay Gulick - clay@ratiosoftware.com - http://ratiosoftware.com
   */
  var md5 = function(data) {

    // convert number to (unsigned) 32 bit hex, zero filled string
    function to_zerofilled_hex(n) {     
        var t1 = (n >>> 0).toString(16)
        return "00000000".substr(0, 8 - t1.length) + t1
    }

    // convert array of chars to array of bytes 
    function chars_to_bytes(ac) {
        var retval = []
        for (var i = 0; i < ac.length; i++) {
            retval = retval.concat(str_to_bytes(ac[i]))
        }
        return retval
    }


    // convert a 64 bit unsigned number to array of bytes. Little endian
    function int64_to_bytes(num) {
        var retval = []
        for (var i = 0; i < 8; i++) {
            retval.push(num & 0xFF)
            num = num >>> 8
        }
        return retval
    }

    //  32 bit left-rotation
    function rol(num, places) {
        return ((num << places) & 0xFFFFFFFF) | (num >>> (32 - places))
    }

    // The 4 MD5 functions
    function fF(b, c, d) {
        return (b & c) | (~b & d)
    }

    function fG(b, c, d) {
        return (d & b) | (~d & c)
    }

    function fH(b, c, d) {
        return b ^ c ^ d
    }

    function fI(b, c, d) {
        return c ^ (b | ~d)
    }

    // pick 4 bytes at specified offset. Little-endian is assumed
    function bytes_to_int32(arr, off) {
        return (arr[off + 3] << 24) | (arr[off + 2] << 16) | (arr[off + 1] << 8) | (arr[off])
    }

    /*
    Conver string to array of bytes in UTF-8 encoding
    See: 
    http://www.dangrossman.info/2007/05/25/handling-utf-8-in-javascript-php-and-non-utf8-databases/
    http://stackoverflow.com/questions/1240408/reading-bytes-from-a-javascript-string
    How about a String.getBytes(<ENCODING>) for Javascript!? Isn't it time to add it?
    */
    function str_to_bytes(str) {
        var retval = [ ]
        for (var i = 0; i < str.length; i++)
            if (str.charCodeAt(i) <= 0x7F) {
                retval.push(str.charCodeAt(i))
            } else {
                var tmp = encodeURIComponent(str.charAt(i)).substr(1).split('%')
                for (var j = 0; j < tmp.length; j++) {
                    retval.push(parseInt(tmp[j], 0x10))
                }
            }
        return retval
    }


    // convert the 4 32-bit buffers to a 128 bit hex string. (Little-endian is assumed)
    function int128le_to_hex(a, b, c, d) {
        var ra = ""
        var t = 0
        var ta = 0
        for (var i = 3; i >= 0; i--) {
            ta = arguments[i]
            t = (ta & 0xFF)
            ta = ta >>> 8
            t = t << 8
            t = t | (ta & 0xFF)
            ta = ta >>> 8
            t = t << 8
            t = t | (ta & 0xFF)
            ta = ta >>> 8
            t = t << 8
            t = t | ta
            ra = ra + to_zerofilled_hex(t)
        }
        return ra
    }

    // conversion from typed byte array to plain javascript array 
    function typed_to_plain(tarr) {
        var retval = new Array(tarr.length)
        for (var i = 0; i < tarr.length; i++) {
            retval[i] = tarr[i]
        }
        return retval
    }

    // check input data type and perform conversions if needed
    var databytes = null
    // String
    var type_mismatch = null
    if (typeof data == 'string') {
        // convert string to array bytes
        databytes = str_to_bytes(data)
    } else if (data.constructor == Array) {
        if (data.length === 0) {
            // if it's empty, just assume array of bytes
            databytes = data
        } else if (typeof data[0] == 'string') {
            databytes = chars_to_bytes(data)
        } else if (typeof data[0] == 'number') {
            databytes = data
        } else {
            type_mismatch = typeof data[0]
        }
    } else if (typeof ArrayBuffer != 'undefined') {
        if (data instanceof ArrayBuffer) {
            databytes = typed_to_plain(new Uint8Array(data))
        } else if ((data instanceof Uint8Array) || (data instanceof Int8Array)) {
            databytes = typed_to_plain(data)
        } else if ((data instanceof Uint32Array) || (data instanceof Int32Array) || 
               (data instanceof Uint16Array) || (data instanceof Int16Array) || 
               (data instanceof Float32Array) || (data instanceof Float64Array)
         ) {
            databytes = typed_to_plain(new Uint8Array(data.buffer))
        } else {
            type_mismatch = typeof data
        }   
    } else {
        type_mismatch = typeof data
    }

    if (type_mismatch) {
        alert('MD5 type mismatch, cannot process ' + type_mismatch)
    }

    function _add(n1, n2) {
        return 0x0FFFFFFFF & (n1 + n2)
    }


    return do_digest()

    function do_digest() {

        // function update partial state for each run
        function updateRun(nf, sin32, dw32, b32) {
            var temp = d
            d = c
            c = b
            //b = b + rol(a + (nf + (sin32 + dw32)), b32)
            b = 0x0FFFFFFFF & (b +
                rol( 
                    0x0FFFFFFFF & (a +  
                        (0x0FFFFFFFF & (nf + (0x0FFFFFFFF & (sin32 + dw32))))
                    ), b32
                )
            )
            a = temp
        }

        // save original length
        var org_len = databytes.length

        // first append the "1" + 7x "0"
        databytes.push(0x80)

        // determine required amount of padding
        var tail = databytes.length % 64
        // no room for msg length?
        if (tail > 56) {
            // pad to next 512 bit block
            for (var i = 0; i < (64 - tail); i++) {
                databytes.push(0x0)
            }
            tail = databytes.length % 64
        }
        for (i = 0; i < (56 - tail); i++) {
            databytes.push(0x0)
        }
        // message length in bits mod 512 should now be 448
        // append 64 bit, little-endian original msg length (in *bits*!)
        databytes = databytes.concat(int64_to_bytes(org_len * 8))

        // initialize 4x32 bit state
        var h0 = 0x67452301
        var h1 = 0xEFCDAB89
        var h2 = 0x98BADCFE
        var h3 = 0x10325476

        // temp buffers
        var a = 0, b = 0, c = 0, d = 0

        // Digest message
        for (i = 0; i < databytes.length / 64; i++) {
            // initialize run
            a = h0
            b = h1
            c = h2
            d = h3

            var ptr = i * 64

            // do 64 runs
            updateRun(fF(b, c, d), 0xd76aa478, bytes_to_int32(databytes, ptr), 7)
            updateRun(fF(b, c, d), 0xe8c7b756, bytes_to_int32(databytes, ptr + 4), 12)
            updateRun(fF(b, c, d), 0x242070db, bytes_to_int32(databytes, ptr + 8), 17)
            updateRun(fF(b, c, d), 0xc1bdceee, bytes_to_int32(databytes, ptr + 12), 22)
            updateRun(fF(b, c, d), 0xf57c0faf, bytes_to_int32(databytes, ptr + 16), 7)
            updateRun(fF(b, c, d), 0x4787c62a, bytes_to_int32(databytes, ptr + 20), 12)
            updateRun(fF(b, c, d), 0xa8304613, bytes_to_int32(databytes, ptr + 24), 17)
            updateRun(fF(b, c, d), 0xfd469501, bytes_to_int32(databytes, ptr + 28), 22)
            updateRun(fF(b, c, d), 0x698098d8, bytes_to_int32(databytes, ptr + 32), 7)
            updateRun(fF(b, c, d), 0x8b44f7af, bytes_to_int32(databytes, ptr + 36), 12)
            updateRun(fF(b, c, d), 0xffff5bb1, bytes_to_int32(databytes, ptr + 40), 17)
            updateRun(fF(b, c, d), 0x895cd7be, bytes_to_int32(databytes, ptr + 44), 22)
            updateRun(fF(b, c, d), 0x6b901122, bytes_to_int32(databytes, ptr + 48), 7)
            updateRun(fF(b, c, d), 0xfd987193, bytes_to_int32(databytes, ptr + 52), 12)
            updateRun(fF(b, c, d), 0xa679438e, bytes_to_int32(databytes, ptr + 56), 17)
            updateRun(fF(b, c, d), 0x49b40821, bytes_to_int32(databytes, ptr + 60), 22)
            updateRun(fG(b, c, d), 0xf61e2562, bytes_to_int32(databytes, ptr + 4), 5)
            updateRun(fG(b, c, d), 0xc040b340, bytes_to_int32(databytes, ptr + 24), 9)
            updateRun(fG(b, c, d), 0x265e5a51, bytes_to_int32(databytes, ptr + 44), 14)
            updateRun(fG(b, c, d), 0xe9b6c7aa, bytes_to_int32(databytes, ptr), 20)
            updateRun(fG(b, c, d), 0xd62f105d, bytes_to_int32(databytes, ptr + 20), 5)
            updateRun(fG(b, c, d), 0x2441453, bytes_to_int32(databytes, ptr + 40), 9)
            updateRun(fG(b, c, d), 0xd8a1e681, bytes_to_int32(databytes, ptr + 60), 14)
            updateRun(fG(b, c, d), 0xe7d3fbc8, bytes_to_int32(databytes, ptr + 16), 20)
            updateRun(fG(b, c, d), 0x21e1cde6, bytes_to_int32(databytes, ptr + 36), 5)
            updateRun(fG(b, c, d), 0xc33707d6, bytes_to_int32(databytes, ptr + 56), 9)
            updateRun(fG(b, c, d), 0xf4d50d87, bytes_to_int32(databytes, ptr + 12), 14)
            updateRun(fG(b, c, d), 0x455a14ed, bytes_to_int32(databytes, ptr + 32), 20)
            updateRun(fG(b, c, d), 0xa9e3e905, bytes_to_int32(databytes, ptr + 52), 5)
            updateRun(fG(b, c, d), 0xfcefa3f8, bytes_to_int32(databytes, ptr + 8), 9)
            updateRun(fG(b, c, d), 0x676f02d9, bytes_to_int32(databytes, ptr + 28), 14)
            updateRun(fG(b, c, d), 0x8d2a4c8a, bytes_to_int32(databytes, ptr + 48), 20)
            updateRun(fH(b, c, d), 0xfffa3942, bytes_to_int32(databytes, ptr + 20), 4)
            updateRun(fH(b, c, d), 0x8771f681, bytes_to_int32(databytes, ptr + 32), 11)
            updateRun(fH(b, c, d), 0x6d9d6122, bytes_to_int32(databytes, ptr + 44), 16)
            updateRun(fH(b, c, d), 0xfde5380c, bytes_to_int32(databytes, ptr + 56), 23)
            updateRun(fH(b, c, d), 0xa4beea44, bytes_to_int32(databytes, ptr + 4), 4)
            updateRun(fH(b, c, d), 0x4bdecfa9, bytes_to_int32(databytes, ptr + 16), 11)
            updateRun(fH(b, c, d), 0xf6bb4b60, bytes_to_int32(databytes, ptr + 28), 16)
            updateRun(fH(b, c, d), 0xbebfbc70, bytes_to_int32(databytes, ptr + 40), 23)
            updateRun(fH(b, c, d), 0x289b7ec6, bytes_to_int32(databytes, ptr + 52), 4)
            updateRun(fH(b, c, d), 0xeaa127fa, bytes_to_int32(databytes, ptr), 11)
            updateRun(fH(b, c, d), 0xd4ef3085, bytes_to_int32(databytes, ptr + 12), 16)
            updateRun(fH(b, c, d), 0x4881d05, bytes_to_int32(databytes, ptr + 24), 23)
            updateRun(fH(b, c, d), 0xd9d4d039, bytes_to_int32(databytes, ptr + 36), 4)
            updateRun(fH(b, c, d), 0xe6db99e5, bytes_to_int32(databytes, ptr + 48), 11)
            updateRun(fH(b, c, d), 0x1fa27cf8, bytes_to_int32(databytes, ptr + 60), 16)
            updateRun(fH(b, c, d), 0xc4ac5665, bytes_to_int32(databytes, ptr + 8), 23)
            updateRun(fI(b, c, d), 0xf4292244, bytes_to_int32(databytes, ptr), 6)
            updateRun(fI(b, c, d), 0x432aff97, bytes_to_int32(databytes, ptr + 28), 10)
            updateRun(fI(b, c, d), 0xab9423a7, bytes_to_int32(databytes, ptr + 56), 15)
            updateRun(fI(b, c, d), 0xfc93a039, bytes_to_int32(databytes, ptr + 20), 21)
            updateRun(fI(b, c, d), 0xffeff47d, bytes_to_int32(databytes, ptr + 40), 15)
            updateRun(fI(b, c, d), 0x85845dd1, bytes_to_int32(databytes, ptr + 4), 21)
            updateRun(fI(b, c, d), 0x6fa87e4f, bytes_to_int32(databytes, ptr + 32), 6)
            updateRun(fI(b, c, d), 0xfe2ce6e0, bytes_to_int32(databytes, ptr + 60), 10)
            updateRun(fI(b, c, d), 0xa3014314, bytes_to_int32(databytes, ptr + 24), 15)
            updateRun(fI(b, c, d), 0x4e0811a1, bytes_to_int32(databytes, ptr + 52), 21)
            updateRun(fI(b, c, d), 0xf7537e82, bytes_to_int32(databytes, ptr + 16), 6)
            updateRun(fI(b, c, d), 0xbd3af235, bytes_to_int32(databytes, ptr + 44), 10)
            updateRun(fI(b, c, d), 0x2ad7d2bb, bytes_to_int32(databytes, ptr + 8), 15)
            updateRun(fI(b, c, d), 0xeb86d391, bytes_to_int32(databytes, ptr + 36), 21)

            // update buffers
            h0 = _add(h0, a)
            h1 = _add(h1, b)
            h2 = _add(h2, c)
            h3 = _add(h3, d)
        }
        // Done! Convert buffers to 128 bit (LE)
        //return int128le_to_hex(h3, h2, h1, h0).toUpperCase()
        return [h0,h1,h2,h3];
    }
  }
  /* ---- end md5 section ---- */

  /**
   * Create a fast 16 bit hash of a 32bit number. Just using a simple mod 2^16 for this for now.
   * TODO: Evaluate the distribution of adler32 to see if simple modulus is appropriate as a hashing function, or wheter 2^16 should be replaced with a prime
   */
  function hash16(num)
  {
    return num % 65536;
  }

  /**
   * Create a 32 bit checksum for the block, based on the adler-32 checksum, with M as 2^16 
   * Used to feed the rollingChecksum function, so returns the broken out pieces that are required for fast calc (since there's no reason to do pointless
   * bit manipulation, we just cache the parts, like {a: ..., b: ..., checksum: ... }.
   *
   * Offset is the start, and end is the last byte for the block to be calculated. end - offset should equal the blockSize - 1
   *
   * Data should be a Uint8Array
   *
   * TODO: according to wikipedia, the zlib compression library has a much more efficient implementation of adler. To speed this up, it might be worth investigating whether that can be used here.
   */
  function adler32(offset, end, data)
  {
    var i=0;
    var a=0;
    var b=0;

    //adjust the end to make sure we don't exceed the extents of the data.
    if(end >= data.length)
      end = data.length - 1;

    for(i=offset; i <= end; i++)
    {
      a += data[i];
      b += a;
    }

    a %= 65536; //65536 = 2^16, used for M in the tridgell equation
    b %= 65536;

    return {a: a, b: b, checksum: (b << 16) | a };

  }

  /**
   * Performs a very fast rolling checksum for incremental searching using Tridgell's modification of adler-32 for rolling checksum
   * Returns an object suitable for use in additional calls to rollingChecksum, same as the adler32 function. This needs to be called with an offset of at least 1!
   * It is the responsibility of the called to make sure we don't exceed the bounds of the data, i.e. end MUST be less than data.length
   */
  function rollingChecksum(adlerInfo, offset, end, data)
  {
    var temp = data[offset - 1]; //this is the first byte used in the previous iteration
    var a = (adlerInfo.a - temp + data[end]) % 65536;
    var b = (adlerInfo.b - ((end - offset + 1) * temp) + a) % 65536;
    return {a: a, b: b, checksum: (b << 16) | a };
  }

  /**
   * Create a document that contains all of the checksum information for each block in the destination data. Everything is little endian
   * Document structure:
   * First 4 bytes = block size
   * Next 4 bytes = number of blocks
   * Repeat for number of blocks:
   *   4 bytes, adler32 checksum
   *   16 bytes, md5 checksum
   *
   */
  function createChecksumDocument(blockSize, data)
  {
    var numBlocks = Math.ceil(data.byteLength / blockSize);
    var i=0;
    var docLength = ( numBlocks * //the number of blocks times
                      ( 4 +       //the 4 bytes for the adler32 plus
                        16) +     //the 16 bytes for the md5
                      4 +         //plus 4 bytes for block size
                      4);         //plus 4 bytes for the number of blocks

    var doc = new ArrayBuffer(docLength);
    var dataView = new Uint8Array(data);
    var bufferView = new Uint32Array(doc);
    var offset = 2;
    var chunkSize = 5; //each chunk is 4 bytes for adler32 and 16 bytes for md5. for Uint32Array view, this is 20 bytes, or 5 4-byte uints

    bufferView[0] = numBlocks;
    bufferView[1] = blockSize;

    //spin through the data and create checksums for each block
    for(i=0; i < numBlocks; i++)
    {
      var start = i * blockSize;
      var end = (i * blockSize) + blockSize;

      //calculate the adler32 checksum
      bufferView[offset] = adler32(start, end - 1, dataView).checksum;
      offset++;

      //calculate the full md5 checksum
      //TODO: optimize the md5 function to avoid a memory copy here. It should accept a range like adler32 function
      var md5sum = md5(data.slice(start, end));
      for(var j=0; j < 4; j++) bufferView[offset++] = md5sum[j];

    }

    return doc;

  }

  /**
   * Parse the checksum document into a hash table
   *
   * The hash table will have 2^16 entries. Each entry will point to an array that has the following strucutre:
   * [
   *  [ [blockIndex, adler32sum, md5sum],[blockIndex, adler32sum, md5sum],... ]
   *  [ [blockIndex, adler32sum, md5sum],[blockIndex, adler32sum, md5sum],... ]
   *  ...
   * ]
   */
  function parseChecksumDocument(checksumDocument)
  {
    var ret = [];
    var i=0;
    var view = new Uint32Array(checksumDocument);
    var blockIndex = 1; //blockIndex is 1 based, not zero based
    var numBlocks = view[1];

    //each chunk in the document is 20 bytes long. 32 bit view indexes 4 bytes, so increment by 5.
    for(i = 2; i <= view.length - 5; i += 5)
    {
      var row = [
                 blockIndex, //the index of the block
                 view[i], //the adler32sum
                 [view[i+1],[view[i+2],view[i+3],view[i+4] //the md5sum
                ];
      ret[hash16(row[0])]=row;
      blockIndex++;
    }

    if(numBlocks != (blockIndex - 1))
    {
      throw "Error parsing checksum document. Document states the number of blocks is: " + numBlocks + " however, " + blockIndex - 1 + " blocks were discovered";
    }

    return ret;

  }


  /**
   * Create a patch document that contains all the information needed to bring the destination data into synchronization with the source data.
   *
   * The patch document looks like this: (little Endian)
   * 4 bytes - blockSize
   * 4 bytes - number of patches
   * For each patch:
   *   4 bytes - last matching block index. NOTE: This is 1 based index! Zero indicates beginning of file, NOT the first block
   *   4 bytes - patch size
   *   n bytes - new data
   */
  function createPatchDocument(checksumDocument, data)
  {
    function appendBuffer( buffer1, buffer2 ) {
      var tmp = new Uint8Array( buffer1.byteLength + buffer2.byteLength );
      tmp.set( new Uint8Array( buffer1 ), 0 );
      tmp.set( new Uint8Array( buffer2 ), buffer1.byteLength );
      return tmp.buffer;
    }

    /**
     * First, check to see if there's a match on the 16 bit hash
     * Then, look through all the entries in the hashtable row for an adler 32 match.
     * Finally, do a strong md5 comparison
     */
    function checkMatch(adlerInfo, hashTable, block)
    {
      var hash = hash16(adlerInfo.checksum);
      if(!(hashTable[hash])) return false;
      var row = hashTable[hash];
      var i=0;
      var matchedIndex=0;

      for(i=0; i<row.length; i++)
      {
        //compare adler32sum
        if(row[i][1] != adlerInfo.checksum) continue;
        //do strong comparison
        md5sum1 = md5(block);
        md5sum2 = row[i][2];
        if( 
            md5sum1[0] == md5sum2[0] &&
            md5sum1[1] == md5sum2[1] &&
            md5sum1[2] == md5sum2[2] &&
            md5sum1[3] == md5sum2[3] 
          )
          return row[0]; //match found, return the matched block index

      }

      throw "Error - checkMatch should never reach this point!"

    }

    var checksumDocumentView = new Uint32Array(checksumDocument);
    var blockSize = checksumDocumentView[0];
    var numBlocks = checksumDocumentView[1];
    var numPatches = 0;

    var patchDocument = new ArrayBuffer(8);
    var patchDocumentView32 = new Uint32Array(patchDocument);
    var i=0;

    var hashTable = parseChecksumDocument(checksumDocument);
    var endOffset = data.byteLength - blockSize;
    var adlerInfo = adler32(0, blockSize - 1, data);

    patchDocumentView32[0]=blockSize;

    //do first match check
    var matchedBlock = checkMatch(

    for(i=blockSize; i <= endOffset; i++)
    {
      adlerInfo = rollingChecksum(adlerInfo, i, i + blockSize - 1, data);
    }

    patchDocumentView32[1] = numPatches;
  }

  /**
   * Apply the patch to the destination data, making it into a duplicate of the source data
   */
  function applyPatch(patchDocument, data)
  {

  }

  /******** Public API ***********/
  this.createChecksumDocument = createChecksumDocument;
  this.createPatchDocument = createPatchDocument;
  this.applyPatch = applyPatch;
  this.util = {md5: md5, adler32: adler32, rollingChecksum: rollingChecksum}; //mostly exposing these for the purposes of unit tests, but hey, if they are useful to someone, have at it!
};


if(((typeof require) != "undefined") && 
   ((typeof module) != "undefined") && 
   ((typeof module.exports) != "undefined"))
    module.exports = BSync;


