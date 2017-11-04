const fs = require('fs');

function clone(obj) { return Object.assign({}, obj); }
function getParents(file, files) {
  files = files || this;
  if (!file.inline) return [];
  return files.filter((f) => {
    // remove absolute ^/ since file names come without it
    const includes = (f.includes || []).map((i) => i.replace(/^\//, ''));
    return includes.indexOf(file.parentHref || file.name) >= 0;// || f.name === file.name;
  });
}
function getDependants(file, files) {
  let queue = [file], parents = [];
  do {
    const upperParents = getParents(queue.shift(), files).filter((f) => parents.indexOf(f) < 0);
    queue = queue.concat(...upperParents);
    parents = parents.concat(...upperParents);
  } while (queue.length);
  return parents;
}
function analyseFiles(file, index, files) {
  if (!file.sourceMap) return;
  if (file.inline) {
    return getDependants(file, files).map((h) => {
      // line and col on source mapp offset are based
      // on the minified/final file, not the original
      const lines  = h.contents.substr(0, h.contents.indexOf(file.contents)).split('\n'),
            line   = lines.length - 1,
            column = lines.pop().length;
      return {file: h.name, script: file.name, line, column};
    });
  } else {
    return [{file: file.name, script: file.name}];
  }
}
function flatten (p, c) {
  if (c) p = p.concat(...c);
  return p;
}
function groupByFile (p, c) {
  p[c.file] = p[c.file] || [];
  p[c.file].push(c);
  p[c.file].sort((a, b) => a.line > b.line);
  return p;
}
function expandHTMLSourceContent(source) {
  return fs.readFileSync(source).toString();
}
function generateSourceMap(fileHref, sources, files) {
  return {
    version: 3,
    file: fileHref,
    sections: sources.map((f) => {
      const file = files.find((a) => a.name === f.script),
            map  = clone(file.sourceMap);
      if (!file.hasImports) {
        map.sourcesContent = map.sources.map(expandHTMLSourceContent);
      }
      map.sources = map.sources.map((source) => {
        return `/${source}${source.endsWith('.js') ? '' : '.js'}`;
      });
      return {
        offset: { line: f.line || 0, column: f.column || 0 },
        map
      };
    })
  };
}

function addSourceMappingURLToSource(file, source) {
  let ref = `\n//# sourceMappingURL=${file.name}\n`;
  if (source.type === 'html') {
    ref = `<script>${ref}<\/script>`;
    const marker = /<\/(body|html)>/;
    if (source.contents.match(marker)) {
      source.contents = source.contents.replace(marker, `${ref}\n<\/$1>`);
    } else {
      source.contents = `${source.contents}\n${ref}`;
    }
  }
  if (source.type === 'js')   source.contents += ref;
  return file;
}
function createVirtualFiles(map) {
  const files  = this,
        source = files.find((f) => f.name === map.file),
        file = {
          type: 'map',
          name: `sourcemaps/${source.name.replace(/\//g, '-')}.map`,
          parentHref: source.name,
          inline: source.inline,
          skip: source.skip,
          contents: JSON.stringify(map, null, 2)
        };
  addSourceMappingURLToSource(file, source);
  return file;
}
function main(files) {
  const r = files
             .map(analyseFiles)
             .reduce(flatten, [])
             .reduce(groupByFile, {}),
        maps = Object.keys(r).map((k) => generateSourceMap(k, r[k], files));
  return maps.map(createVirtualFiles, files);
}

module.exports = main;