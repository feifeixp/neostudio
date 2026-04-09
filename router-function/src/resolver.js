import { getRouteByWorkerName } from './store/tablestore.js';

export async function resolve(host) {
  // host format: alice.yourplatform.com or alice.yourplatform.com:8080
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');
  
  // E.g. worker1.localhost => worker1
  const workerName = parts[0];

  return await getRouteByWorkerName(workerName);
}
