var data = new Uint8Array([0,1,2,3,4,5,6,7,8,9,
    10,11,12,13,14,15,16,17,18,19,
    20,21,22,23,24,25,26,27,28,29,
    30,31,32,33,34,35,36,37,38,39,
    40,41,42,43,44,45,46,47,48,49,
    50,51,52,53,54,55,56,57,58,59,
    60,61,62,63,64,65,66,67,68,69,
    70,71,72,73,74,75,76,77,78,79,
    80,81,82,83,84,85,86,87,88,89,
    90,91,92,93,94,95,96,97,98,99,
    100,101,102,103,104,105,106,107,108,109,
    110,111,112,113,114,115,116,117,118,119,
    120,121,122,123,124,125,126,127,128,129,
    130,131,132,133,134,135,136,137,138,139,
    140,141,142,143,144,145,146,147,148,149,
    150,151,152,153,154,155,156,157,158,159,
    160,161,162,163,164,165,166,167,168,169,
    170,171,172,173,174,175,176,177,178,179,
    180,181,182,183,184,185,186,187,188,189,
    190,191,192,193,194,195,196,197,198,199,
    200,201,202,203,204,205,206,207,208,209,
    210,211,212,213,214,215,216,217,218,219,
    220,221,222,223,224,225,226,227,228,229,
    230,231,232,233,234,235,236,237,238,239,
    240,241,242,243,244,245,246,247,248,249,
    250,251,252,253,254,255]);

function verifyData(buffer1, buffer2)
{
  var buffer1View8 = new Uint8Array(buffer1);
  var buffer2View8 = new Uint8Array(buffer2);

  if(buffer1.byteLength != buffer2.byteLength) return false;

  var pass = true;
  for(var i=0; i<buffer1View8.length; i++)
    if(buffer1View8[i] != buffer2View8[i])
    {
      pass=false;
      break;
    }
  return pass;
}

var isNode = ((typeof require) != "undefined") && ((typeof module) != "undefined") && ((typeof module.exports) != "undefined");

QUnit.module("utilities tests");
test("read int 32",
    function()
    {
      var arr = new Uint32Array(2);
      arr[0] = 2147483647;
      var buff = arr.buffer;
      var test = BSync.util.readInt32(new Uint8Array(buff),0);
      ok(test == 2147483647, "int32 read correctly");

      arr[1] = 4294967295;
      var test = BSync.util.readInt32(new Uint8Array(buff),4);
      ok(test == 4294967295, "int32 read correctly");

      
    });
test("adler-32",
    function()
    {
      var testData = new Uint8Array(data.buffer.slice(0));
      var result1 = BSync.util.adler32(0,10,testData);
      ok(result1.a == 55, "a component correct");
      var result2 = BSync.util.adler32(0,4,testData);
      
      ok(result2.b == 20, "b component correct");
      ok((result2.b << 16 | result2.a) == result2.checksum, "checksum correct");
      
      result2 = BSync.util.adler32(0,300,testData);
      result1 = BSync.util.adler32(0,255,testData);
      ok(result2.checksum == result1.checksum, "range overflow corrected");
      var result3=0;
      for(var i=0; i<20; i++)
      {
        testData[Math.floor(Math.random() * 256)]++;
        result2 = BSync.util.adler32(0,255,testData);
        result3 = BSync.util.adler32(0,255,testData);
        ok(result2.checksum == result3.checksum, "checksum consistent for varying data");
        ok(result1.checksum != result2.checksum, "change correctly detected");
      }
    });

test("rolling checksum", function()
    {
      var i=0;
      var testData = new Uint8Array(data.buffer.slice(0));
      var result1;
      var blockSize=10;
      var adler1 = BSync.util.adler32(0,blockSize-1,testData);
      var adler2;
      result1 = BSync.util.rollingChecksum(adler1,1,blockSize, testData);

      //roll through the whole set, verifying the rolling checksums match straight adler
      for(i=2; i<testData.length - blockSize; i++)
      {
        result1 = BSync.util.rollingChecksum(result1,i,i+blockSize-1,testData);
        adler2 = BSync.util.adler32(i, i+blockSize - 1, testData);
        ok(
          (result1.checksum == adler2.checksum) &&  //they are the same
          (adler2.checksum != 0), //they are not zero
          "rolling checksums match and are not zero");
      }

    });

test("checksum document", function()
    {
      var testData1 = data.buffer.slice(0);
      var blockSize = 10;
      var doc1 = BSync.createChecksumDocument(blockSize,testData1);
      var Uint8View1 = new Uint8Array(doc1);
      var Uint32View1 = new Uint32Array(doc1);
      ok(true,"checksum document 1 created");

      var testData2 = data.buffer.slice(0);
      var doc2 = BSync.createChecksumDocument(blockSize,testData2);
      var Uint8View2 = new Uint8Array(doc2);
      var Uint32View2 = new Uint32Array(doc2);
      ok(true,"checksum document 2 created");
      //verify that checksum docs are the same,
      var pass = true;
      for(var i=0; i<Uint8View1.length; i++)
        if(Uint8View1[i] != Uint8View2[i]) { pass=false; break;}

      ok(pass,"checksum documents match byte for byte");

      pass = false;
      //change data in first block
      (new Uint8Array(testData2))[0]++;
      doc2 = BSync.createChecksumDocument(blockSize,testData2);
      Uint8View2 = new Uint8Array(doc2);
      Uint32View2 = new Uint32Array(doc2);

      for(var i=0; i<Uint8View1.length; i++)
        if(Uint8View1[i] != Uint8View2[i]) { pass=true; break;}

      ok(pass, "checksum documents differ after change");

      ok(Uint32View1[2] != Uint32View2[3], "adler32 is different for first block");
      pass = false;
      for(var i=3; i<6; i++)
        if(Uint32View1[i] != Uint32View2[i]) { pass=true; break;}
      ok(pass, "md5 sum is different for first block");

      pass=true;
      for(var i=7; i<Uint32View1.length; i++)
        if(Uint32View1[i] != Uint32View2[i]) { pass=false; break;}
      ok(pass, "checksums are the same for all blocks except the first");


    });

test("patch document",
    function()
    {
      //TODO: Seriously improve this test.
      var testData1 = data.buffer.slice(0);
      var blockSize = 10;
      var doc1 = BSync.createChecksumDocument(blockSize,testData1);

      var testData2 = data.buffer.slice(0);
      (new Uint8Array(testData2))[0]++;

      var patchDocument = BSync.createPatchDocument(doc1,testData2);
      ok(true, "patch document created");

    });

test("apply patch",
    function()
    {
      var testData1 = data.buffer.slice(0);
      var blockSize = 10;
      var doc1 = BSync.createChecksumDocument(blockSize,testData1);
      var checksumDocView;
      var patchDocumentView;
      var dataView;
      var testData2 = data.buffer.slice(0);
      var patchDocument = BSync.createPatchDocument(doc1,testData2);
      var testData3 = BSync.applyPatch(patchDocument, testData1);
      ok(verifyData(testData1,testData2), "identical documents");
      //modify the data a bit
      (new Uint8Array(testData2))[0]++;
      patchDocument = BSync.createPatchDocument(doc1,testData2);
      testData3 = BSync.applyPatch(patchDocument, testData1);
      ok(verifyData(testData2,testData3), "identical documents");

      //modify it a bit more
      (new Uint8Array(testData2))[0]++;
      (new Uint8Array(testData2))[10]++;
      (new Uint8Array(testData2))[11]++;
      (new Uint8Array(testData2))[20]++;
      (new Uint8Array(testData2))[21]++;
      (new Uint8Array(testData2))[30]++;
      (new Uint8Array(testData2))[40]++;
      (new Uint8Array(testData2))[50]++;
      (new Uint8Array(testData2))[100]++;
      (new Uint8Array(testData2))[110]++;
      (new Uint8Array(testData2))[120]++;
      (new Uint8Array(testData2))[130]++;
      (new Uint8Array(testData2))[140]++;
      (new Uint8Array(testData2))[150]++;
      (new Uint8Array(testData2))[200]++;
      (new Uint8Array(testData2))[210]++;
      (new Uint8Array(testData2))[211]++;
      (new Uint8Array(testData2))[213]++;
      (new Uint8Array(testData2))[215]++;
      (new Uint8Array(testData2))[220]++;
      (new Uint8Array(testData2))[230]++;
      (new Uint8Array(testData2))[240]++;
      (new Uint8Array(testData2))[254]++;
      patchDocument = BSync.createPatchDocument(doc1,testData2);
      testData3 = BSync.applyPatch(patchDocument, testData1);
      ok(verifyData(testData2,testData3), "identical documents");

      //let's do lots runs of randomized mods. should get pretty good modification distribution through these runs for testing
      for(var j=0; j<1000; j++)
      {
        testData2 = data.buffer.slice(0);
        checksumDocView = new Uint8Array(doc1);

        //modify a random number of bytes
        var numMods = Math.ceil(Math.random() * testData2.byteLength);
        for(var k=0; k < numMods; k++)
          (new Uint8Array(testData2))[Math.floor(Math.random() * testData2.byteLength)]++;
        patchDocument = BSync.createPatchDocument(doc1,testData2);
        patchDocumentView = new Uint8Array(patchDocument);
        testData3 = BSync.applyPatch(patchDocument,testData1);
        dataView = new Uint8Array(testData3);
        ok(verifyData(testData2, testData3), "exact match");
      }

    });

QUnit.module("larger file tests");

//utility function to get file data, regardless if we are in node or browser
function getFileData(file, callback)
{
  if(isNode)
  {
    var fs = require("fs");
    fs.readFile(file, 
        function(err, data)
        {
          if(err)
            console.log("Error getting file data: " + err);
          callback(data);
        });
  }
  else
  {
    var xhr = new XMLHttpRequest();

    xhr.addEventListener('load', function(){
      if (xhr.status == 200){
        callback(xhr.response);
      }
    });

    xhr.open('GET', file);
    xhr.responseType = 'blob';
    xhr.send(null);
  }
}

stop();

var path="";
if(isNode) path = __dirname + "/audio_files/sample_44k_32bit_float_stereo.wav";
else path = "./audio_files/sample_44k_32bit_float_stereo.wav";
getFileData(path,
    function(data)
    {
      function runTest(buffer)
      {
        start();
        test("audio file",
          function()
          {
            ok(true, "got data");
            var doc = BSync.createChecksumDocument(10000, buffer);
            ok(true, "created doc");
            var clone = buffer.slice(0);
            var numMods = 10;
            var cloneView8 = new Uint8Array(clone);
            //cloneView8[0]++;
            for(var i=0; i<numMods; i++)
            {
              cloneView8[Math.floor(Math.random() * clone.byteLength)]++;
            }
            var patchDocument = BSync.createPatchDocument(doc, clone);
            ok(true, "created patch document");
            var patchedFile = BSync.applyPatch(patchDocument, buffer);
            ok(verifyData(patchedFile, clone),"music file patched, identical");
          });
      }
      if(isNode)
      {
      }
      else
      {
        var reader = new FileReader();
        reader.onload = function(f)
        {
          var buffer = f.target.result;
          runTest(buffer);
        };
        reader.readAsArrayBuffer(data);
      }
    });

if(isNode)
{
  QUnit.module("node specific tests");
}
