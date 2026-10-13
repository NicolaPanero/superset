#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

if (process.argv[2] !== "import")
	throw new Error("No login or agent commands allowed");
const data = JSON.parse(readFileSync(process.argv[3], "utf8"));
const db = new Database(process.env.OPENCODE_DB);
const info = data.info;
db.run(
	"INSERT INTO session(id,directory,title,version,time_created,time_updated) VALUES(?,?,?,?,?,?)",
	[
		info.id,
		info.directory,
		info.title,
		info.version,
		info.time.created,
		info.time.updated,
	],
);
for (const message of data.messages) {
	db.run(
		"INSERT INTO message(id,session_id,time_created,data) VALUES(?,?,?,?)",
		[
			message.info.id,
			info.id,
			message.info.time.created,
			JSON.stringify(message.info),
		],
	);
	for (const part of message.parts)
		db.run("INSERT INTO part(id,message_id,session_id,data) VALUES(?,?,?,?)", [
			part.id,
			message.info.id,
			info.id,
			JSON.stringify(part),
		]);
}
db.close();
console.log(`Imported session: ${info.id}`);
