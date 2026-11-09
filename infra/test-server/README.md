# Test server (low cost)

A single small ARM server in Stockholm (eu-north-1) that runs the app and Postgres together, for testing before the full stack in `infra/` is used. Roughly $10 a month, paid from AWS credits while they last.

- `user-data.sh`: first-boot setup (Docker, swap, local secrets in `/opt/eci/.env` that never leave the server).
- `run.sh`: pulls the app image from ECR and (re)starts Postgres and the app on port 80. `run.sh <registry> <site-url> seed` also loads the sample data.

All resources are tagged `Project=eci-hub-test`. Managed through AWS Systems Manager, so no SSH port is open. Plain HTTP only: do not use real customer data on it.
