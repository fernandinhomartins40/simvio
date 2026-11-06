import { describe, expect, it } from "vitest";
import { confirmEmailMail, invitationMail, passwordChangedMail, resetPasswordMail } from "../lib/mail-templates.js";

describe("templates de e-mail", () => {
  it("levam logo, cores da marca, link e versão em texto", () => {
    const url = "https://simvio.test/redefinir-senha#token=abc";
    const mail = resetPasswordMail("a@b.test", url);
    expect(mail.html).toContain("/brand/logo-email.png");
    expect(mail.html).toContain("#C6F36A");
    expect(mail.html).toContain("#073E42");
    expect(mail.html).toContain(url);
    expect(mail.text).toContain(url);
    expect(mail.text).not.toContain("<");
  });

  it("escapa nomes vindos do usuário no HTML", () => {
    const mail = invitationMail("a@b.test", "<script>x</script>", 'Org "<img src=x>', "https://simvio.test/convite#token=a");
    expect(mail.html).not.toContain("<script>x");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(confirmEmailMail("a@b.test", "<b>Ana</b>", "https://x").html).not.toContain("<b>Ana");
  });

  it("aviso de senha alterada não carrega token", () => {
    expect(passwordChangedMail("a@b.test").html).not.toContain("token=");
  });
});
