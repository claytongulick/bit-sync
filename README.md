bit-sync
========

This is a simple utility to synchronize two pieces of data, the source and the destination, using the rsync algorithm. The reason you might want
to use this utility rather than just copying the source to the destination is to save on bandwidth. The rsync algorithm is really clever
about only sending the parts of the file that have changed, rather than the whole file. For small files, this isn't that important, but
when you start dealing with modifications to files that are tens or hundreds of megs in size, it's a pretty big deal.

This is a pure javascript implementation of the rsync algorithm, meaning it can be used pretty much anywhere and doesn't have any dependencies - so
feel free to use it in the browser or in nodejs, or wherever. For convenience, it's available in both npm and bower (see installation instructions below).

Some example use cases might be in a collaborative image or video editing application where a series of small modifications are made to relatively
large files. It's way nicer to just send the changed bits than to make your user wait around until large files finish uploading and downloading. It
also saves a ton of bandwidth.

As the name implies, this does a binary sync, so that means that the source and destination data should both be ArrayBuffers. This does not work on strings (yet?).

This utility is intentionally transport agnostic. The intent is that it will be equally useful for local comparisons, http, socket.io, or webRTC -
in browser-to-browser, browser-to-node, or node-to-node scenarios. To support http-like transports where binary data can be problematic, 
the generated documents can base64 encoded.

Additionally, no assumption is made as to the source of the data - it should be equally useful for synching files, memcached binaries, database blobs, or
anything else.

The current state of development
--------------------------------

All tests pass, and it performs reasonably well, but there are still several areas that can use improvement. 
The md5 algorithm needs to be rewritten with performance in mind. This is the biggest bottleneck right now with creating checksum documents, and it's pretty slow.
There is room for considerable optimization in the patch document size. Currently it just sends the whole block when a modification is detected, even if only one 
byte has changed.
A simple optimization to send some magic bytes in the patch document when the data matches 100% is also high on the list of things to do. Currently all matched indexes
are added to the patch document, which is really pointless if there's a 100% match.

How it works
------------

The mechanism used for synchronization is the famous rsync algorithm developed by Andrew Tridgell (http://rsync.samba.org/tech_report/)

In a nutshell, what happens is that there are, somewhere, two pieces of data that needs to be synchronized, a source and a destination.

We're able to synchronize them in a single rountrip. 

First, some information is generated about the destination data. This information contains checksum info for each block of size S in the destination data. We'll call this 
the "checksum document". For performance reasons, it's wise to cache this document and only regenerate it when the destination data has changed. This utility doesn't do
any caching itself, so if you'd like to cache just generate a checksum document and store it in your favorite place. Preferablly gzipped, if you want to save some 
bandwith and space.

When the source wants to synchronize to the destination, a request for the checksum document is made. The source uses this checksum document to scan through itself and detect
changes. It then creates a new document called the "patch instructions". This document is given to the destination, and used to modify the destination so that it looks
exactly like the source.

Usage
-----

A fair amount of effort was made to keep the api for the synchronization process very simple. So simple, in fact, that there are only three functions!

The three functions you will use are: createChecksumDocument, createPatchDocument, applyPatch. In NodeJS, these functions are just exported. In the browser, the BSync namespace is used (i.e. BSync.createChecksumDocument(...) ).
There isn't any magic going on inside of them, and they don't need any fancy "this" context, so feel free to pass them around or alias them however you like, you won't hurt anything.

The hairy details are below, but basically all you need to do is call createChecksumDocument on the destination data, send that document to the source data somehow, then call
createPatchDocument on the source data using the checksum document you just sent. Last step is to send the patch document back to the destination, and call applyPatch. That's it. After
you complete those three calls, the destination data will look just like the source data, but you've drastically reduced your bandwith usage over a straight copy.

The only parts where this might get a bit annoying is in the transport itself. The createChecksumDocument and createPatchDocument both return binary data in an ArrayBuffer. The reason for this
is to reduce transmission size as much as possible (that's the whole point of rsync, right?). This can be problematic for httpish transports, so to deal with this
it is recommended that the returned ArrayBuffer be base64 encoded prior to sending. For sockety transports, the raw binary document is probably better, it'll save about 30% bandwidth. Most modern
browsers support xhr2 which allows posting of binary data from js, so if you don't need to support ie 9 and below, you're in good shape to just send this natively. Mostly, if you're using this
to sync up data from the Web Audio API or some other fancy thing, you're going to be browser restricted anyway.

**function createChecksumDocument(blockSize, data)**

This function will create the checksum document for the destination data. This is what the source uses to determine what's changed. It accepts two 
parameters: blockSize and data. The document that's generated is an ArrayBuffer of binary data. It's important to note that this function call is slow! Both adler32 and md5sums are generated
for each block in the data. For 10s of megs of data, this can easily take a few seconds. You'll want to cache this document and only regenerate it when needed.

The blocksize parameter is just the size of the "chunks" you want to use to generate checksums. This really depends on the size of your data. Algorimically, there are some
tradeoffs here between computation speed and false first-pass hits, if you want to know more about it read Andrew Tridgell's paper on rsync. If you're not sure, don't care,
or are too busy, just try a value of 1000 for this. If your data isn't that big, the utility will adjust it for you. 

There are also some bandwith considerations to the block size. There's a tradeoff between the size of the checksum document and the size of the edited blocks that will be sent over the wire.

The data parameter is the destination data you want to synchronize. This can be pretty much any array-like type that javascript supports. Strings, arrays and ArrayBuffers are all
fine. ArrayBuffers will be iterated over using a Uint8Array view, so pay attention to the endianness of your data, this utility makes no attempt to correct mismatched endianness.

**function createPatchDocument(checksumDocument, data)**

This will create the patch document that is used to actually apply the changes to the destination data. Depending on the differences between the source and the destination, this file
could end up being pretty large, so you might want to try compressing it. It only needs two parameters: the checksumDocument created by the createChecksumDocument() function, and the 
source data. The patch document that's created by this call should be applied to the destination data with the applyPatch call. Again, this document will be an ArrayBuffer.

**function applyPatch(patchDocument, data)**

This applies the changes in the patchDocument to the destination data, returning a new ArrayBuffer that is synchronized with the source data. The patch document should have been created by a call to 
createPatchDocument() on the source data. It takes two parameters as well, the patch document to apply, and the destination data to apply it to. Note: this doesn't modify the destination data in-place, it creates a new buffer. This is because ArrayBuffer sizes are immutable.

Installation
------------

For node, just npm install bit-sync. For the browser, if you're using bower you can do bower install bit-sync and add the appropriate script tag.
If you're not using a fancy package manager, no worries, it's only a single file. Just download bit-sync.js and include it however you like.

In node, the three api functions are exported from the module, so just do something like ds = require("bit-sync"); ds.createChecksumDocument(...);

In the browser, we're using the BSync namespace, so BSync.createPatchDocument(...); should work.

Current source can always be obtained from https://github.com/claytongulick/bit-sync.git

Notes on updates and use
------------------------

This is one of those libraries that probably won't be updated very often, really only for bug fixes or optimizations (like, if some new browser-native stuff comes out, like a native md5 function, for example). 
If you're looking at github and see that it's been years and years since an update, don't worry about it - this is intended to be a simple, stable utility that doesn't change much, and really intended for use 
within other larger projects or libraries. 

If you find a bug, please file an issue at https://github.com/claytongulick/bit-sync/issues

Tests
-----
Making sure everything works correctly with data synchronization is sort of important, so test coverage exists both in the browser and for node.
The unit testing framework of choice is QUnit - chosen for it's simplicity and ability to work easily in both the browser and node.

To run tests from node, just do: npm test

To run tests in the browser, just point your browser at tests/index.html - this won't work from the local file system, you'll need to host it on some sort of server.

Internal functions are tested independently, and for that purpose are exposed via the util object in the BSync namespace. For example, BSync.util.adler32(...) .

It's not recommended to directly execute any function in the util object, since these internal functions probably won't have a stable api and might change depending on what sort of native 
support the browses offer over time.

Credits and Thanks
------------------
Of course, most credit goes to Andrew Tridgell for rsync and for being awesome.
Also, credit for the native js implementation of md5 goes to Luigi Galli - LG@4e71.org - http://faultylabs.com - who is also awesome and placed his md5 implementation in the public domain.

