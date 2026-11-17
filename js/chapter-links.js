function openLegacyChapter() {
  const chapter = /^#(q[1-5])$/.exec(window.location.hash);
  if (chapter) {
    window.location.replace("./" + chapter[1] + ".html");
  }
}

window.addEventListener("hashchange", openLegacyChapter);
openLegacyChapter();
