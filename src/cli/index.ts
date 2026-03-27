#!/usr/bin/env node

const command = process.argv[2] || "init";

switch (command) {
  case "init":
    import("./init.js").then((m) => m.runInit());
    break;
  case "update":
    import("./update.js").then((m) => m.runUpdate());
    break;
  default:
    console.log("Usage: kore-chamber <init|update>");
    console.log("");
    console.log("Commands:");
    console.log("  init     초기 설치 (볼트 생성 + 질문 + 스킬/에이전트 설치)");
    console.log("  update   스킬/에이전트를 최신 버전으로 업데이트");
    process.exit(1);
}
