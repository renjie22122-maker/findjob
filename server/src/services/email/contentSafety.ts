/** Mail is untrusted data. Never resolve, preview or follow URLs from it. */
export function redactMailSecrets(text: string): string {
  return text
    .replace(/(?:https?:\/\/|www\.)[^\s<>"'）)]+/gi, '[链接已隐藏，需本人在邮箱查看]')
    .replace(/\b(?:[A-Z0-9._%+-]+)@(?:[A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '[邮箱]')
    .replace(/((?:验证码|校验码|动态密码|一次性密码|通行证|访问口令|access code|passcode|verification code|one.time password|OTP|password|密码)\s*[:：是为]?\s*)[A-Za-z0-9_-]{4,}/gi, '$1[已隐藏]');
}

export function isAuthenticationMail(subject: string): boolean {
  return /验证码|校验码|登录验证|身份验证|重置密码|账号安全|账户安全|verification code|verify your|sign.in|password reset|one.time|magic link|security alert/i.test(subject);
}

export function sensitiveContentWarnings(text: string): string[] {
  return /验证码|身份验证|一次性|仅限一次|重置密码|one.time|magic link|verify|token=|auth=|signature=/i.test(text)
    ? ['邮件含身份验证或一次性操作信息：链接与验证码不参与分析，相关操作请本人在原邮箱完成'] : [];
}
