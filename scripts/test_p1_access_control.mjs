import fs from 'fs';
import path from 'path';
import axios from 'axios';
import mongoose from 'mongoose';
import User from '../models/users.js';
import SkuInventory from '../models/SkuInventory.js';
import CompanyMapping from '../models/CompanyMapping.js';
import MasterSku from '../models/MasterSku.js';
import MasterSkuHistory from '../models/MasterSkuHistory.js';
import MasterRate from '../models/MasterRate.js';
import MasterRateHistory from '../models/MasterRateHistory.js';

// 1. Environment Configuration (No hardcoded credentials)
function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
// Require explicit test configuration; never inherit the application's database or credentials.
const BASE_URL = process.env.TEST_BASE_URL;
const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const MONGODB_URI = process.env.TEST_MONGODB_URI;
if (!BASE_URL || !ADMIN_USERNAME || !ADMIN_PASSWORD || !MONGODB_URI) {
  throw new Error('TEST_BASE_URL, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD and TEST_MONGODB_URI are required');
}
const testUrl = new URL(BASE_URL);
const dbName = new URL(MONGODB_URI).pathname.slice(1);
if (!['localhost', '127.0.0.1'].includes(testUrl.hostname) || !dbName.startsWith('codex_p1_test_')) {
  throw new Error('Tests require a loopback server and a dedicated codex_p1_test_ database');
}

// Run-specific uppercase identifiers to ensure complete isolation and zero collision with real business records
const RUN_ID = 'T' + Date.now().toString().slice(-6);
const FIXTURE_DATE = new Date('2099-07-15T00:00:00.000Z');
const FIXTURE_DATE_STR = '2099-07-15';
const FIXTURE_END_DATE_STR = '2099-07-16';

const CO_ALPHA_CANONICAL = `TEST_CO_ALPHA_${RUN_ID}`;
const CO_ALPHA_RAW = `TEST_CO_ALPHA_RAW_${RUN_ID}`;
const CO_BETA = `TEST_CO_BETA_${RUN_ID}`;
const CO_GAMMA = `TEST_CO_GAMMA_${RUN_ID}`;

const SKU_A = `SKU_A_${RUN_ID}`;
const SKU_B = `SKU_B_${RUN_ID}`;
const SKU_C = `SKU_C_${RUN_ID}`;
const ORIGIN_A = `ORIGIN_A_${RUN_ID}`;
const ORIGIN_B = `ORIGIN_B_${RUN_ID}`;
const ORIGIN_C = `ORIGIN_C_${RUN_ID}`;

// Registry to track every created fixture for cleanup in finally
const registry = {
  userIds: [],
  inventoryIds: [],
  mappingIds: [],
  masterSkuIds: [],
  masterRateIds: []
};

async function run() {
  console.log('===============================================================');
  console.log(' P1 ACCESS CONTROL REGRESSION SUITE (ISOLATED FIXTURES)');
  console.log(` Target Server: ${BASE_URL}`);
  console.log(` Target DB:     ${MONGODB_URI}`);
  console.log(` Run ID:        ${RUN_ID}`);
  console.log('===============================================================\n');

  let passes = 0;
  let failures = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passes++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
      failures++;
    }
  }

  // Strict shape validator for reconciliation-billing responses
  function assertBillingShape(data, context) {
    assert(data && typeof data === 'object', `${context}: Response data is an object`);
    assert(data.success === true, `${context}: success is true`);
    assert(typeof data.startDate === 'string', `${context}: startDate is string`);
    assert(typeof data.endDate === 'string', `${context}: endDate is string`);
    assert(data.summary && typeof data.summary === 'object', `${context}: summary is an object`);
    assert(typeof data.summary.inventoryQty === 'number', `${context}: summary.inventoryQty is number`);
    assert(typeof data.summary.netAmount === 'number', `${context}: summary.netAmount is number`);
    assert(Array.isArray(data.companyWise), `${context}: companyWise is Array`);
    assert(Array.isArray(data.dateWise), `${context}: dateWise is Array`);
    assert(Array.isArray(data.monthWise), `${context}: monthWise is Array`);
    assert(Array.isArray(data.skuWise), `${context}: skuWise is Array`);
    assert(Array.isArray(data.companiesList), `${context}: companiesList is Array`);
  }

  let adminCompanyId;
  try {
    // Connect to isolated MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log(`[DB] Connected successfully to database: "${mongoose.connection.name}"`);

    // 1. Authenticate Admin
    console.log('\n[1] Authenticating Admin via environment credentials...');
    const adminLoginRes = await axios.post(`${BASE_URL}/api/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.data?.token, 'Admin authentication succeeded');
    const adminToken = adminLoginRes.data.token;
    adminCompanyId = new mongoose.Types.ObjectId(adminLoginRes.data.user.company);
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // Helper to create disposable test users (never touch existing real users)
    async function createTestUser(role, permissions = [], assignedCompanies = [], hasAllCompanyAccess = false) {
      const username = `test_p1_mgr_${RUN_ID.toLowerCase()}_${Math.random().toString(36).substring(2, 7)}`;
      const createRes = await axios.post(`${BASE_URL}/api/user`, {
        name: `Test Mgr ${RUN_ID}`,
        mobileNumber: '9999999999',
        username,
        password: 'password123',
        role,
        permissions,
        assignedCompanies,
        hasAllCompanyAccess
      }, { headers: adminHeaders });

      const userId = createRes.data?.data?._id;
      registry.userIds.push(userId);

      const loginRes = await axios.post(`${BASE_URL}/api/login`, {
        username,
        password: 'password123'
      });

      return {
        id: userId,
        username,
        token: loginRes.data.token,
        headers: { Authorization: `Bearer ${loginRes.data.token}` },
        user: loginRes.data.user
      };
    }

    // 2. Setup Isolated Nonempty Fixture Data
    console.log('\n[2] Setting up known nonempty fixture data in isolated test namespace...');
    // A. Mappings: Raw A -> Canonical A
    const mapDoc = await CompanyMapping.create({
      company: adminCompanyId,
      platform: 'all',
      rawName: CO_ALPHA_RAW,
      canonicalName: CO_ALPHA_CANONICAL,
      isIgnored: false,
      isDeleted: false
    });
    registry.mappingIds.push(mapDoc._id);

    // B. Master SKU & Rate for SKU_A, SKU_B, SKU_C
    const [rateA, rateB, rateC] = await Promise.all([
      MasterRate.create({ company: adminCompanyId, origin: ORIGIN_A, itemRate: 100, boxRate: 2.4, boxReturnRate: 2.4 }),
      MasterRate.create({ company: adminCompanyId, origin: ORIGIN_B, itemRate: 200, boxRate: 2.4, boxReturnRate: 2.4 }),
      MasterRate.create({ company: adminCompanyId, origin: ORIGIN_C, itemRate: 300, boxRate: 2.4, boxReturnRate: 2.4 })
    ]);
    registry.masterRateIds.push(rateA._id, rateB._id, rateC._id);

    const [skuA, skuB, skuC] = await Promise.all([
      MasterSku.create({ company: adminCompanyId, sku: SKU_A, origin: ORIGIN_A, size: 'M' }),
      MasterSku.create({ company: adminCompanyId, sku: SKU_B, origin: ORIGIN_B, size: 'L' }),
      MasterSku.create({ company: adminCompanyId, sku: SKU_C, origin: ORIGIN_C, size: 'XL' })
    ]);
    registry.masterSkuIds.push(skuA._id, skuB._id, skuC._id);

    // C. SkuInventory on 2099-07-15
    // Record A under RAW alias name (10 qty @ ₹100), Record B (15 qty @ ₹200), Record C unassigned (20 qty @ ₹300)
    const [invA, invB, invC] = await Promise.all([
      SkuInventory.create({
        company: adminCompanyId,
        companyName: CO_ALPHA_RAW,
        sku: SKU_A,
        quantity: 10,
        selectedDate: FIXTURE_DATE,
        uploadedBy: new mongoose.Types.ObjectId(adminLoginRes.data.user._id),
        uploadedByName: 'Test Admin',
        isDeleted: false
      }),
      SkuInventory.create({
        company: adminCompanyId,
        companyName: CO_BETA,
        sku: SKU_B,
        quantity: 15,
        selectedDate: FIXTURE_DATE,
        uploadedBy: new mongoose.Types.ObjectId(adminLoginRes.data.user._id),
        uploadedByName: 'Test Admin',
        isDeleted: false
      }),
      SkuInventory.create({
        company: adminCompanyId,
        companyName: CO_GAMMA,
        sku: SKU_C,
        quantity: 20,
        selectedDate: FIXTURE_DATE,
        uploadedBy: new mongoose.Types.ObjectId(adminLoginRes.data.user._id),
        uploadedByName: 'Test Admin',
        isDeleted: false
      })
    ]);
    registry.inventoryIds.push(invA._id, invB._id, invC._id);
    console.log('  Fixtures initialized: Company A (Raw Alias -> Canonical), Company B, Company C (Unassigned).');

    // 3. Finding 1: User API Security & Non-Escalation Checks
    console.log('\n--- FINDING 1: User API Server-Side Authorization & Self-Escalation Prevention ---');
    const mgrA = await createTestUser('manager', ['EXTRACT_SKU'], [CO_ALPHA_CANONICAL], false);
    const mgrB = await createTestUser('manager', ['EXTRACT_SKU'], [CO_BETA], false);

    // Company mapping is admin-only, even if a manager has all master permissions.
    for (const method of ['get', 'post', 'delete']) {
      try {
        await axios({ method, url: `${BASE_URL}/api/company-mapping`,
          headers: mgrA.headers, data: { action: 'add-alias', rawName: CO_GAMMA, canonicalName: CO_ALPHA_CANONICAL } });
        assert(false, `Manager mapping ${method} must be denied`);
      } catch (err) {
        assert(err.response?.status === 403, `Manager mapping ${method} is denied with 403`);
      }
    }
    const adminMappings = await axios.get(`${BASE_URL}/api/company-mapping`, { headers: adminHeaders });
    assert(adminMappings.status === 200, 'Admin can read company mappings');
    const adminAlias = `ADMIN_ALIAS_${RUN_ID}`;
    const adminMappingWrite = await axios.post(`${BASE_URL}/api/company-mapping`, {
      action: 'add-alias', rawName: adminAlias, canonicalName: CO_ALPHA_CANONICAL, platform: 'all'
    }, { headers: adminHeaders });
    assert(adminMappingWrite.status === 200, 'Admin can add company mappings');
    const adminAliasDoc = await CompanyMapping.findOne({ company: adminCompanyId, rawName: adminAlias });
    if (adminAliasDoc) registry.mappingIds.push(adminAliasDoc._id);
    assert(Boolean(adminAliasDoc), 'Admin mapping persisted');
    const adminMappingDelete = await axios.delete(`${BASE_URL}/api/company-mapping`, {
      params: { action: 'remove-alias', rawName: adminAlias }, headers: adminHeaders
    });
    assert(adminMappingDelete.status === 200, 'Admin can remove company mappings');
    assert((await CompanyMapping.findById(adminAliasDoc._id)).isDeleted === true, 'Admin mapping removal persisted');

    // 1a: Manager GET /api/user -> 403 Forbidden
    try {
      await axios.get(`${BASE_URL}/api/user`, { headers: mgrA.headers });
      assert(false, 'Manager GET /api/user should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Manager GET /api/user returns 403 Forbidden');
    }

    // 1b: Manager POST /api/user -> 403 Forbidden
    try {
      await axios.post(`${BASE_URL}/api/user`, {
        name: 'Attacker User',
        username: `attacker_${RUN_ID.toLowerCase()}`,
        password: 'password123',
        role: 'admin'
      }, { headers: mgrA.headers });
      assert(false, 'Manager POST /api/user should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Manager POST /api/user returns 403 Forbidden');
    }

    // 1c: Manager DELETE /api/user -> 403 Forbidden
    try {
      await axios.delete(`${BASE_URL}/api/user`, {
        data: { _id: mgrB.id },
        headers: mgrA.headers
      });
      assert(false, 'Manager DELETE /api/user should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Manager DELETE /api/user returns 403 Forbidden');
    }

    // 1d: Manager PUT another user -> 403 Forbidden
    try {
      await axios.put(`${BASE_URL}/api/user`, {
        _id: mgrB.id,
        name: 'Compromised Name'
      }, { headers: mgrA.headers });
      assert(false, 'Manager modifying another user should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Manager modifying another user returns 403 Forbidden');
    }

    // 1e: Manager attempts self-escalation via PUT (submitting role, permissions, assignedCompanies, hasAllCompanyAccess)
    const selfEscalationRes = await axios.put(`${BASE_URL}/api/user`, {
      _id: mgrA.id,
      name: `Updated Mgr Name ${RUN_ID}`,
      role: 'admin',
      permissions: ['MASTER_SKU_WRITE', 'MASTER_RATE_WRITE', 'PARTY_BILLS'],
      assignedCompanies: [],
      hasAllCompanyAccess: true
    }, { headers: mgrA.headers });
    assert(selfEscalationRes.status === 200, 'Self-service PUT returned 200 for allowed profile fields');

    // Verify in DB directly: profile field (name) was updated, but privileged fields remained untouched
    const freshDbUser = await User.findById(mgrA.id).lean();
    assert(freshDbUser.name === `Updated Mgr Name ${RUN_ID}`, 'Self-service name update succeeded');
    assert(freshDbUser.role === 'manager', 'Privilege Escalation Blocked: Role remained "manager"');
    assert(!freshDbUser.permissions?.includes('PARTY_BILLS'), 'Privilege Escalation Blocked: Permissions were not escalated');
    assert(
      Array.isArray(freshDbUser.assignedCompanies) &&
      freshDbUser.assignedCompanies.length === 1 &&
      freshDbUser.assignedCompanies[0] === CO_ALPHA_CANONICAL,
      'Privilege Escalation Blocked: Assigned companies remained untouched'
    );
    assert(freshDbUser.hasAllCompanyAccess !== true, 'Privilege Escalation Blocked: hasAllCompanyAccess remained false');

    // 4. Finding 2: Quick-Map Multi-Write Permissions & No Partial Writes on Rejection
    console.log('\n--- FINDING 2: Quick-Map Multi-Write Permissions & No Partial Writes on Rejection ---');
    const mgrReadOnly = await createTestUser('manager', ['MASTER_SKU_READ', 'MASTER_RATE_READ'], []);
    const mgrSkuWriteOnly = await createTestUser('manager', ['MASTER_SKU_WRITE', 'MASTER_SKU_READ'], []);
    const mgrRateWriteOnly = await createTestUser('manager', ['MASTER_RATE_WRITE', 'MASTER_RATE_READ'], []);
    const mgrDualWrite = await createTestUser('manager', ['MASTER_SKU_WRITE', 'MASTER_RATE_WRITE'], []);

    // 2a: Read-only manager quick-map -> 403
    try {
      await axios.post(`${BASE_URL}/api/reconciliation-billing/quick-map`, {
        sku: `SKU_REJECT_RO_${RUN_ID}`,
        origin: `ORIGIN_REJECT_RO_${RUN_ID}`,
        itemRate: 150
      }, { headers: mgrReadOnly.headers });
      assert(false, 'Read-only manager quick-map should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Read-only manager quick-map returns 403 Forbidden');
    }

    // 2b: Rate-only write manager quick-map -> 403
    try {
      await axios.post(`${BASE_URL}/api/reconciliation-billing/quick-map`, {
        sku: `SKU_REJECT_RATE_${RUN_ID}`,
        origin: `ORIGIN_REJECT_RATE_${RUN_ID}`,
        itemRate: 150
      }, { headers: mgrRateWriteOnly.headers });
      assert(false, 'Rate-only write manager quick-map should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Rate-only write manager quick-map returns 403 Forbidden');
    }

    // 2c & 2d: SKU-only write manager quick-map -> 403 AND verify NO PARTIAL WRITES occurred in DB
    const rejectedSku = `SKU_REJECT_NO_PARTIAL_${RUN_ID}`;
    const rejectedOrigin = `ORIGIN_REJECT_NO_PARTIAL_${RUN_ID}`;

    const skuBefore = await MasterSku.countDocuments({ company: adminCompanyId, sku: rejectedSku });
    const skuHistBefore = await MasterSkuHistory.countDocuments({ company: adminCompanyId, sku: rejectedSku });
    const rateBefore = await MasterRate.countDocuments({ company: adminCompanyId, origin: rejectedOrigin });
    const rateHistBefore = await MasterRateHistory.countDocuments({ company: adminCompanyId, 'details.origin': rejectedOrigin });
    assert(skuBefore === 0 && rateBefore === 0, 'Pre-check: rejected SKU and Origin do not exist prior to request');

    try {
      await axios.post(`${BASE_URL}/api/reconciliation-billing/quick-map`, {
        sku: rejectedSku,
        origin: rejectedOrigin,
        itemRate: 150
      }, { headers: mgrSkuWriteOnly.headers });
      assert(false, 'SKU-only write manager quick-map should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'SKU-only write manager quick-map returns 403 Forbidden');
    }

    // Direct DB count inspection: verify no partial write occurred in any collection!
    const skuAfter = await MasterSku.countDocuments({ company: adminCompanyId, sku: rejectedSku });
    const skuHistAfter = await MasterSkuHistory.countDocuments({ company: adminCompanyId, sku: rejectedSku });
    const rateAfter = await MasterRate.countDocuments({ company: adminCompanyId, origin: rejectedOrigin });
    const rateHistAfter = await MasterRateHistory.countDocuments({ company: adminCompanyId, 'details.origin': rejectedOrigin });

    assert(skuAfter === 0, 'No Partial Write: MasterSku was NOT written on rejected request');
    assert(skuHistAfter === 0, 'No Partial Write: MasterSkuHistory was NOT written on rejected request');
    assert(rateAfter === 0, 'No Partial Write: MasterRate was NOT written on rejected request');
    assert(rateHistAfter === 0, 'No Partial Write: MasterRateHistory was NOT written on rejected request');

    // 2e: Dual-write manager quick-map succeeds (200)
    const validSku = `SKU_VALID_QM_${RUN_ID}`;
    const validOrigin = `ORIGIN_VALID_QM_${RUN_ID}`;
    const qmSuccessRes = await axios.post(`${BASE_URL}/api/reconciliation-billing/quick-map`, {
      sku: validSku,
      origin: validOrigin,
      itemRate: 120
    }, { headers: mgrDualWrite.headers });
    assert(qmSuccessRes.status === 200 && qmSuccessRes.data?.success, 'Dual-write manager quick-map succeeds (200)');

    // Track written records for cleanup
    const writtenSkuDoc = await MasterSku.findOne({ company: adminCompanyId, sku: validSku });
    if (writtenSkuDoc) registry.masterSkuIds.push(writtenSkuDoc._id);
    const writtenRateDoc = await MasterRate.findOne({ company: adminCompanyId, origin: validOrigin });
    if (writtenRateDoc) registry.masterRateIds.push(writtenRateDoc._id);

    // 5. Permission Revocation on Subsequent Requests
    console.log('\n--- PERMISSION REVOCATION ON SUBSEQUENT REQUESTS ---');
    // Revoke rate write on mgrDualWrite -> subsequent quick-map MUST immediately fail with 403
    await axios.put(`${BASE_URL}/api/user`, {
      _id: mgrDualWrite.id,
      permissions: ['MASTER_SKU_WRITE'] // revoked rate write
    }, { headers: adminHeaders });

    try {
      await axios.post(`${BASE_URL}/api/reconciliation-billing/quick-map`, {
        sku: `SKU_AFTER_REVOCATION_${RUN_ID}`,
        origin: `ORIGIN_AFTER_REVOCATION_${RUN_ID}`,
        itemRate: 120
      }, { headers: mgrDualWrite.headers });
      assert(false, 'Subsequent quick-map after rate write revocation should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Permission Revocation: Subsequent quick-map immediately rejected with 403 Forbidden');
    }

    // Revoke Master SKU write, give EXTRACT_SKU -> subsequent master-sku index fails, but lookup succeeds
    await axios.put(`${BASE_URL}/api/user`, {
      _id: mgrDualWrite.id,
      permissions: ['EXTRACT_SKU'] // revoked all master read/write
    }, { headers: adminHeaders });

    try {
      await axios.get(`${BASE_URL}/api/master-sku?all=true`, { headers: mgrDualWrite.headers });
      assert(false, 'Subsequent GET /api/master-sku?all=true after SKU permission revocation should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'Permission Revocation: Subsequent /api/master-sku?all=true immediately rejected with 403 Forbidden');
    }

    const subsequentLookupRes = await axios.get(`${BASE_URL}/api/master-sku/lookup`, { headers: mgrDualWrite.headers });
    assert(subsequentLookupRes.status === 200, 'Subsequent GET /api/master-sku/lookup succeeds with remaining EXTRACT_SKU permission');

    // 6. Finding 3: all=true Read Authorization Bypass & Minimal Lookup Route
    console.log('\n--- FINDING 3: all=true Read Authorization Bypass & Minimal Lookup Route ---');
    const mgrNoRead = await createTestUser('manager', ['EXTRACT_SKU'], []);

    // 3a: /api/master-sku?all=true without read permission -> 403
    try {
      await axios.get(`${BASE_URL}/api/master-sku?all=true`, { headers: mgrNoRead.headers });
      assert(false, 'GET /api/master-sku?all=true without read permission should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'GET /api/master-sku?all=true without read permission returns 403 Forbidden');
    }

    // 3b: /api/master-rate?all=true without read permission -> 403
    try {
      await axios.get(`${BASE_URL}/api/master-rate?all=true`, { headers: mgrNoRead.headers });
      assert(false, 'GET /api/master-rate?all=true without read permission should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'GET /api/master-rate?all=true without read permission returns 403 Forbidden');
    }

    // 3c: /api/master-sku/lookup with EXTRACT_SKU -> 200 with minimal fields
    const lookupRes = await axios.get(`${BASE_URL}/api/master-sku/lookup`, { headers: mgrNoRead.headers });
    assert(lookupRes.status === 200 && lookupRes.data?.success, 'User with EXTRACT_SKU gets 200 on /api/master-sku/lookup');
    assert(Array.isArray(lookupRes.data?.skus) && lookupRes.data.skus.length > 0, 'Lookup returns an array of SKUs');
    const sampleRecord = lookupRes.data.skus[0];
    assert('sku' in sampleRecord && 'origin' in sampleRecord, 'Lookup record contains "sku" and "origin"');
    assert(!('rateHistory' in sampleRecord) && !('itemRate' in sampleRecord), 'Lookup record strictly excludes sensitive rate fields');

    // 3d: /api/master-sku/lookup with zero permissions -> 403
    const mgrZeroPerms = await createTestUser('manager', [], []);
    try {
      await axios.get(`${BASE_URL}/api/master-sku/lookup`, { headers: mgrZeroPerms.headers });
      assert(false, 'User without EXTRACT_SKU or read permission on /api/master-sku/lookup should return 403');
    } catch (err) {
      assert(err.response?.status === 403, 'User without EXTRACT_SKU or read permission on /api/master-sku/lookup returns 403 Forbidden');
    }

    // 7. Finding 4: Known Nonempty Fixture Data, Aliases, Zero Assignments vs hasAllCompanyAccess
    console.log('\n--- FINDING 4: Known Nonempty Fixtures, Aliases, Zero Assignments & hasAllCompanyAccess ---');
    const mgrZeroAssigned = await createTestUser('manager', ['EXTRACT_SKU'], [], false);
    const mgrAssignedAB = await createTestUser('manager', ['EXTRACT_SKU'], [CO_ALPHA_CANONICAL, CO_BETA], false);
    const mgrUnrestricted = await createTestUser('manager', ['EXTRACT_SKU'], [], true);

    const billingUrl = `${BASE_URL}/api/reconciliation-billing?startDate=${FIXTURE_DATE_STR}&endDate=${FIXTURE_END_DATE_STR}`;

    // 4a: Manager with Zero Assignments (assignedCompanies: [], hasAllCompanyAccess: false)
    const zeroRes = await axios.get(billingUrl, { headers: mgrZeroAssigned.headers });
    assertBillingShape(zeroRes.data, 'Zero Assignments Manager');
    assert(zeroRes.data.companiesList.length === 0, 'Zero assignments manager gets companiesList = []');
    assert(zeroRes.data.companyWise.length === 0, 'Zero assignments manager gets companyWise = [] (0 company entries)');
    assert(zeroRes.data.dateWise.length === 0, 'Zero assignments manager gets dateWise = []');
    assert(zeroRes.data.monthWise.length === 0, 'Zero assignments manager gets monthWise = []');
    assert(zeroRes.data.skuWise.length === 0, 'Zero assignments manager gets skuWise = []');
    assert(zeroRes.data.summary.inventoryQty === 0, 'Zero assignments manager gets summary.inventoryQty === 0');
    assert(zeroRes.data.summary.netAmount === 0, 'Zero assignments manager gets summary.netAmount === 0');

    // Also check sku-inventory-filters endpoint for zero assignments
    const zeroFiltersRes = await axios.get(`${BASE_URL}/api/sku-inventory-filters`, { headers: mgrZeroAssigned.headers });
    assert(
      Array.isArray(zeroFiltersRes.data?.companyNames) && zeroFiltersRes.data.companyNames.length === 0,
      'Zero assignments manager gets companyNames = [] in sku-inventory-filters'
    );

    // 4b: Manager Assigned to A & B (with Alias resolution and Unassigned C exclusion)
    const abRes = await axios.get(billingUrl, { headers: mgrAssignedAB.headers });
    assertBillingShape(abRes.data, 'Assigned A & B Manager');

    // CompaniesList assertions:
    assert(abRes.data.companiesList.includes(CO_ALPHA_CANONICAL), 'Assigned canonical Company A is present in companiesList');
    assert(abRes.data.companiesList.includes(CO_BETA), 'Assigned Company B is present in companiesList');
    assert(!abRes.data.companiesList.includes(CO_GAMMA), 'Unassigned Company C is strictly ABSENT from companiesList');

    // CompanyWise assertions:
    const alphaEntry = abRes.data.companyWise.find(c => c.companyName === CO_ALPHA_CANONICAL);
    const betaEntry = abRes.data.companyWise.find(c => c.companyName === CO_BETA);
    const gammaEntry = abRes.data.companyWise.find(c => c.companyName === CO_GAMMA);

    assert(Boolean(alphaEntry), 'Company A entry exists in companyWise');
    assert(
      alphaEntry?.inventoryQty === 10,
      'Mapped Alias Proof: Orders under RAW alias name resolved to Canonical A with quantity 10'
    );
    assert(Boolean(betaEntry) && betaEntry.inventoryQty === 15, 'Company B entry exists in companyWise with quantity 15');
    assert(!gammaEntry, 'Isolation Proof: Unassigned Company C is strictly ABSENT from companyWise');

    // Summary calculation assertions: Prove unassigned C (20 qty) did NOT leak into summary
    assert(
      abRes.data.summary.inventoryQty === 25,
      `Summary Isolation Proof: Total inventoryQty is exactly 25 (10 + 15), excluding Unassigned C (20 qty)`
    );

    // 4c: Manager Assigned to A requesting Unassigned C via query parameter -> 0 rows
    const unassignedQueryUrl = `${billingUrl}&companies=${CO_GAMMA}`;
    const unassignedQueryRes = await axios.get(unassignedQueryUrl, { headers: mgrAssignedAB.headers });
    assertBillingShape(unassignedQueryRes.data, 'Requesting Unassigned Account');
    assert(
      unassignedQueryRes.data.companyWise.length === 0,
      'Requesting unassigned account returns empty companyWise (0 rows)'
    );
    assert(
      unassignedQueryRes.data.summary.inventoryQty === 0,
      'Requesting unassigned account returns summary.inventoryQty === 0'
    );

    // 4d: Manager with hasAllCompanyAccess: true -> Sees all 3 companies (A, B, and C)
    const unrestrictedRes = await axios.get(billingUrl, { headers: mgrUnrestricted.headers });
    assertBillingShape(unrestrictedRes.data, 'Unrestricted Manager');
    assert(unrestrictedRes.data.companiesList.includes(CO_ALPHA_CANONICAL), 'Unrestricted manager sees Company A');
    assert(unrestrictedRes.data.companiesList.includes(CO_BETA), 'Unrestricted manager sees Company B');
    assert(unrestrictedRes.data.companiesList.includes(CO_GAMMA), 'Unrestricted manager sees Company C');
    assert(
      unrestrictedRes.data.summary.inventoryQty >= 45,
      `Unrestricted manager sees all fixtures (inventoryQty >= 45: 10 + 15 + 20)`
    );

  } catch (error) {
    console.error('Unhandled exception during regression execution:', error);
    failures++;
  } finally {
    // 8. Strict Cleanup of All Created Fixtures
    console.log('\n[Clean Up] Cleaning up isolated test fixtures and test users...');
    try {
      if (registry.userIds.length > 0) {
        const res = await User.deleteMany({ _id: { $in: registry.userIds } });
        console.log(`  Deleted ${res.deletedCount} temporary test users.`);
      }
      if (registry.inventoryIds.length > 0) {
        const res = await SkuInventory.deleteMany({ _id: { $in: registry.inventoryIds } });
        console.log(`  Deleted ${res.deletedCount} temporary inventory records.`);
      }
      if (registry.mappingIds.length > 0) {
        const res = await CompanyMapping.deleteMany({ _id: { $in: registry.mappingIds } });
        console.log(`  Deleted ${res.deletedCount} temporary company mappings.`);
      }
      if (registry.masterSkuIds.length > 0) {
        const res = await MasterSku.deleteMany({ _id: { $in: registry.masterSkuIds } });
        console.log(`  Deleted ${res.deletedCount} temporary Master SKU records.`);
      }
      if (registry.masterRateIds.length > 0) {
        const res = await MasterRate.deleteMany({ _id: { $in: registry.masterRateIds } });
        console.log(`  Deleted ${res.deletedCount} temporary Master Rate records.`);
      }
      // Also clean any history created for test run SKUs / Origins
      if (adminCompanyId) await MasterSkuHistory.deleteMany({ company: adminCompanyId, sku: { $regex: new RegExp(RUN_ID) } });
      if (adminCompanyId) await MasterRateHistory.deleteMany({ company: adminCompanyId, 'details.origin': { $regex: new RegExp(RUN_ID) } });

      await mongoose.disconnect();
      console.log('  Database connection closed cleanly.');
    } catch (cleanupErr) {
      console.error('Error during fixture cleanup:', cleanupErr);
      failures++;
      await mongoose.disconnect();
    }

    console.log('\n===============================================================');
    console.log(` FINAL RESULTS: Total Passes: ${passes} | Total Failures: ${failures}`);
    console.log('===============================================================');

    if (failures > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

run();
