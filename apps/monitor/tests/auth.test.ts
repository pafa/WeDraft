import {it,expect,vi} from 'vitest';
import {generateKeyPair,exportJWK,createLocalJWKSet,createRemoteJWKSet,SignJWT} from 'jose';
import {authorized} from '../src/auth.js';
vi.mock('jose',async original=>({...await original<typeof import('jose')>(),createRemoteJWKSet:vi.fn()}));
it('requires a signed, unexpired token for the exact Access app and owner',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const local=createLocalJWKSet({keys:[await exportJWK(publicKey)]});
 vi.mocked(createRemoteJWKSet).mockReturnValue(local as ReturnType<typeof createRemoteJWKSet>);
 const env={ENVIRONMENT:'production',ACCESS_ISSUER:'https://team.cloudflareaccess.com',ACCESS_AUD:'expected-app',ADMIN_EMAILS:'owner@example.com'} as Env;
 async function check(email='owner@example.com',aud='expected-app',expires='1h',issuer=env.ACCESS_ISSUER){
   const token=await new SignJWT({email}).setProtectedHeader({alg:'RS256'}).setSubject('user').setIssuedAt().setExpirationTime(expires).setIssuer(issuer).setAudience(aud).sign(privateKey);
   return authorized(new Request('https://wedraft.example.com/monitor',{headers:{'Cf-Access-Jwt-Assertion':token}}),env);
 }
 expect(await check()).toBe(true);expect(await check('other@example.com')).toBe(false);expect(await check('owner@example.com','other-app')).toBe(false);expect(await check('owner@example.com','expected-app','-1s')).toBe(false);expect(await check('owner@example.com','expected-app','1h','https://other.cloudflareaccess.com')).toBe(false);
 expect(await authorized(new Request('https://wedraft.example.com/monitor',{headers:{'Cf-Access-Jwt-Assertion':'fake.token.signature'}}),env)).toBe(false);
});
