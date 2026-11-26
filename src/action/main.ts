#!/usr/bin/env node
// Run by .github/workflows/issue-comment.yml: reads the comment from COMMENT_BODY and prints the
// reply to stdout; prints nothing when the comment is not a scan command.
import { replyTo } from './issue-comment.ts';

const reply = await replyTo(process.env.COMMENT_BODY ?? '', { fetch, token: process.env.GITHUB_TOKEN || undefined });
if (reply !== undefined) process.stdout.write(`${reply}\n`);
