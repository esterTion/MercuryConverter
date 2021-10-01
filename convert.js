const fs = require('fs')

function main() {
  let src, dest
  let watch = false
  {
    let i=2
    const argv = process.argv
    if (argv[i] === '-w') {
      watch = true
      i++
    }
    if (argv.length < i + 2) {
      console.log(`node convert.js [-w] <chart-file.txt> <convert-to.mer>`)
      console.log('\t-w                   keep watching without exiting')
      console.log('\t<chart-file.txt>     source chart file')
      console.log('\t<convert-to.mer>     destination mer file')
      process.exit()
    }
    src = argv[i++]
    dest = argv[i++]
    if (argv[i] === '-w') {
      watch = true
      i++
    }
  }

  if (!fs.existsSync(src)) {
    console.log(`file ${src} does not exist`)
    process.exit()
  }
  convert(src, dest);
}
function convert($inPath, $outPath) {
  let $inData = fs.readFileSync($inPath, {encoding: 'UTF-8'});
  if ($inData.substr(0, 13) !== '#MercuryChart') {
    // force header check
    console.log('invalid chart file, please put "#MercuryChart" at the beginning')
    process.exit()
  }
  $inData = $inData.replace(/ +/, '\t')
  let $inLines = $inData.split('\n');
  let $headers = [];
  let $noteHeaders = [];
  let $metChanges = [];
  let $notes = [];
  let $offset = 0;

  let $holdId = 0;
  $inLines.forEach($line => {
    $line = $line.trim();
    if (!$line) return;
    $line = $line.split("\t");
    if ($line[0] === '#MercuryChart') {
      return;
    } else if ($line[0] === '#offset') {
      $offset = parseFloat($line[1]);
    } else if ($line[0].substr(0, 1) === '#') {
      // header
      let $item = {'sec':parseInt($line[1]), 'pos':positionConvert($line[2], $line[1], $metChanges)};
      switch (($line[0])) {
        case '#bpm': {$item['type'] = 2; $item['val1'] = $line[3]; break;}
        case '#met': {
          $item['type'] = 3;
          if ($item['pos'] !== 0) {
            console.log("met not at section start");
            return;
          }
          $item['val1'] = $line[3];
          $item['val2'] = $line[4];
          $metChanges.push({'sec':$item['sec'],'res':1920 * $line[4] / $line[3]});
          $metChanges = $metChanges.sort(($a, $b) => ($a['sec'] - $b['sec']));
          break;
        }
        case '#sfl': {$item['type'] = 5; $item['val1'] = $line[3]; break;}
      }
      $noteHeaders.push($item);
    } else {
      // body line
      let $item = {'sec':parseInt($line[0]), 'pos':positionConvert($line[1], $line[0], $metChanges)};
      switch ($line[2]) {
        case 't': {$type=1;break;}
        case 'T': {$type=20;break;}
        case 'c': {$type=16;break;}
        case 'C': {$type=26;break;}
        case 'i': {$type=3;break;}
        case 'o': {$type=4;break;}
        case 'l': {$type=5;break;}
        case 'r': {$type=7;break;}
        case 'I': {$type=21;break;}
        case 'O': {$type=22;break;}
        case 'L': {$type=23;break;}
        case 'R': {$type=24;break;}
        case 'h': {$type=9;break;}
        case 'H': {$type=25;break;}
        case 'end': {$type=14;break;}
        case 'on':  {$type=12;break;}
        case 'off': {$type=13;break;}
      }
      $item['type'] = 1;
      $item['noteType'] = $type;
      $item['lane'] = $line[3];
      $item['width'] = $line[4];
      $item['node'] = 1;
      if ($type == 12) {
        const $laneEffType = {'r':0,'l':1,'m':2};
        if ($laneEffType[$line[5]] === undefined) console.log('unknown type for lane on: '+$line.join(' '));
        $item['ext1'] = $laneEffType[$line[5]];
      } else if ($type == 13) {
        const $laneEffType = {'r':0,'l':1,'m':2};
        if ($laneEffType[$line[5]] === undefined) console.log('unknown type for lane on: '+$line.join(' '));
        $item['ext1'] = $laneEffType[$line[5]];
      } else if ($type == 9 || $type == 25) $item['holdId'] = $holdId;
      $notes.push($item);

      if ($type == 9 || $type == 25) {
        // hold logic
        let $hold = [{'pos':$item['sec'] *1920 + $item['pos'], 'lane':parseInt($item['lane']), 'width':parseInt($item['width'])}];
        for (let $holdParamI=5; $holdParamI<$line.length; $holdParamI++) {
          $holdParam = $line[$holdParamI].split(',');
          $hold.push({'pos':$holdParam[0] *1920 + positionConvert($holdParam[1], $holdParam[0], $metChanges), 'lane':parseInt($holdParam[2]), 'width':parseInt($holdParam[3])});
        }
        for (let $holdI=0; $holdI < $hold.length - 1; $holdI++) {
          let $prevHold = $hold[$holdI];
          let $nextHold = $hold[$holdI + 1];
          let $laneDiff = $nextHold['lane'] - $prevHold['lane'];
          let $widthDiff = $nextHold['width'] - $prevHold['width'];
          let $step = Math.max(Math.abs($laneDiff), Math.abs($widthDiff));
          for (let $stepI=1; $stepI<$step; $stepI++) {
            $item = {};
            let $pos = Math.round($prevHold['pos'] + ($nextHold['pos'] - $prevHold['pos']) / $step * $stepI);
            let $lane = Math.round($prevHold['lane'] + ($nextHold['lane'] - $prevHold['lane']) / $step * $stepI);
            let $width = Math.round($prevHold['width'] + ($nextHold['width'] - $prevHold['width']) / $step * $stepI);
            $item['sec'] = Math.floor($pos / 1920);
            $item['pos'] = $pos % 1920;
            $item['type'] = 1;
            $item['noteType'] = 10;
            $item['lane'] = $lane;
            $item['width'] = $width;
            $item['holdId'] = $holdId;
            $item['node'] = 0;
            $notes.push($item);
          }
          {
            $item = {};
            let $pos = $nextHold['pos'];
            let $lane = $nextHold['lane'];
            let $width = $nextHold['width'];
            $item['sec'] = Math.floor($pos / 1920);
            $item['pos'] = $pos % 1920;
            $item['type'] = 1;
            $item['noteType'] = 10;
            if ($holdI == $hold.length - 2) $item['noteType'] = 11;
            $item['lane'] = $lane;
            $item['width'] = $width;
            $item['holdId'] = $holdId;
            $item['node'] = 1;
            $notes.push($item);
          }
        }
        $holdId++;
      }
    }
  });
  let $out = [];
  $headers.push(`#OFFSET ${$offset}`)
  $noteHeaders = sortHeaders($noteHeaders);
  $noteHeaders.forEach($n => {
    $out.push(alignLine($n));
  });
  $notes = sortNotes($notes);
  $notes.forEach($n => {
    $out.push(alignLine($n));
  });
  fs.writeFileSync($outPath, $headers.join("\n")+"\n"+$out.join("\n")+"\n");
}

function sortWeight($item, $weights) {
  $weight = 0;
  $weights.forEach($w => {
    $weight += $item[$w[0]] * $w[1];
  })
  return $weight;
}
function sortHeaders($noteHeaders) {
  $sortWeight = [['sec', 192000], ['pos', 100], ['type', 1]];
  $noteHeaders = $noteHeaders.sort(($a, $b) => (
    sortWeight($a, $sortWeight) - sortWeight($b, $sortWeight)
  ));
  $out = [];
  $noteHeaders.forEach($header => {
    let $item = [];
    $item.push($header['sec']);
    $item.push($header['pos']);
    $item.push($header['type']);
    $item.push($header['val1']);
    if ($header['val2'] !== undefined) $item.push($header['val2']);
    $out.push($item);
  })
  return $out;
}
function sortNotes($notes) {
  $sortWeight = [['sec', 19200000], ['pos', 10000], ['noteType', 100], ['lane', 1]];
  $notes = $notes.sort(($a, $b) => (
    sortWeight($a, $sortWeight) - sortWeight($b, $sortWeight)
  ));
  for (let $i=0; $i<$notes.length; $i++) {
    $notes[$i]['id'] = $i;
  }
  $holdIdMap = [];
  for (let $i=$notes.length-1; $i>=0; $i--) {
    if ($notes[$i]['holdId'] !== undefined) {
      if ($notes[$i]['noteType'] != 11) {
        $notes[$i]['ext1'] = $holdIdMap[$notes[$i]['holdId']];
      }
      $holdIdMap[$notes[$i]['holdId']] = $notes[$i]['id'];
    }
  }
  $out = [];
  $notes.forEach($note => {
    let $item = [];
    $item.push($note['sec']);
    $item.push($note['pos']);
    $item.push(1);
    $item.push($note['noteType']);
    $item.push($note['id']);
    $item.push(($note['lane'] % 60));
    $item.push($note['width']);
    $item.push($note['node']);
    if ($note['ext1'] !== undefined) $item.push($note['ext1']);
    $out.push($item);
  })
  return $out;
}
function alignLine($n) {
  $out = '';
  $n.forEach($i => {
    $i = $i.toString();
    $padLen = Math.max(1, 5 - $i.length);
    $out += ' '.repeat($padLen) + $i;
  })
  return $out;
}

function positionConvert($custom = '', $section, $metChanges) {
  let $sectionResolution = 1920;
  let $sectionScaleResolution = 1920;
  for (let $i=0; $i<$metChanges.length; $i++) {
    if ($section >= $metChanges[$i]['sec']) $sectionResolution = $metChanges[$i]['res'];
  }
  let $customSep = $custom.split('/');
  if ($customSep.length != 2) {
    throw new Error('bad position '.$custom);
  }
  return $sectionScaleResolution * $sectionScaleResolution / $sectionResolution * $customSep[0] / $customSep[1];
}

main()