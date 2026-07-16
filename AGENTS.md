<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
<!-- BEGIN:agent-rules -->

# General Principles (The Foundation)

1. **Security First**: Assume every request, form submission, and API interaction is potentially malicious. Validate _everything_. Never trust client-side input or even user-controlled API responses.

2. **Principle of Least Privilege**: Don't use `root` or `Administrator`. Don't run commands as `sudo` unless absolutely necessary and documented. The web server should run as a low-privilege user (like `www-data` or `nginx`).

3. **Data Integrity over Speed**: It is better to be slow and correct than fast and wrong. Do not compromise database integrity for a "clever" optimization.

4. **Immutable Infrastructure**: Do not modify configuration files in-place on the server. Use a "Pull" or "Apply" model (GitOps). The server should be considered ephemeral.

5. **Idempotency**: Ensure scripts and commands can be run multiple times without causing errors or duplicate data (e.g., `CREATE TABLE IF NOT EXISTS`).

<!-- END:agent-rules -->
