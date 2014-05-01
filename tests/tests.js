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

QUnit.module("utilities tests");
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
