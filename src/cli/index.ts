#!/usr/bin/env node

const command = process.argv[2] || "init";
const args = process.argv.slice(3);

switch (command) {
  case "init":
    import("./init.js").then((m) => m.runInit());
    break;
  case "update":
    import("./update.js").then((m) => m.runUpdate());
    break;
  case "collect":
    import("./collect.js").then((m) => m.runCollect(args));
    break;
  case "doctor":
    import("./doctor.js").then((m) => m.runDoctor());
    break;
  case "status":
    import("./status.js").then((m) => m.runStatus());
    break;
  case "mcp":
    import("../mcp/server.js");
    break;
  default:
    console.log("Usage: kore-chamber <command>");
    console.log("");
    console.log("Commands:");
    console.log("  init                초기 설치 (볼트 생성 + 질문 + 스킬/에이전트 설치)");
    console.log("  update              스킬/에이전트를 최신 버전으로 업데이트");
    console.log("  collect [options]   대화에서 지식 수확 (TS 코어 엔진)");
    console.log("  doctor              설치 상태 진단");
    console.log("  status              볼트 통계");
    console.log("  mcp                 MCP 서버 실행 (Claude Code 연동)");
    console.log("");
    console.log("Collect options:");
    console.log("  --dry-run           실제 저장 없이 계획만 표시");
    console.log("  --session <id>      특정 세션 JSONL 지정");
    console.log("  --output <format>   json 또는 markdown (기본: markdown)");
    process.exit(1);
}
