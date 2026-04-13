#!/usr/bin/env python3
"""
SENSA-SMART — Email Alert Sender (SA-Grade)
Sử dụng Python3 built-in smtplib — KHÔNG cần pip install thêm gì.
Gửi email HTML đẹp mắt tới danh sách nhiều người nhận (comma-separated).
"""

import argparse
import smtplib
import sys
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def build_html_body(subject: str, body: str) -> str:
    """Tạo HTML email template chuyên nghiệp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    # Chuyển \n thành <br> cho phần body
    body_html = body.replace("\\n", "<br>").replace("\n", "<br>")

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #f5f5f5;
                margin: 0;
                padding: 20px;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }}
            .header {{
                background: {"#dc3545" if "CRITICAL" in subject else "#ffc107" if "WARNING" in subject else "#28a745"};
                color: white;
                padding: 20px 24px;
                font-size: 18px;
                font-weight: 600;
            }}
            .header.recovery {{
                background: #28a745;
            }}
            .body {{
                padding: 24px;
                color: #333;
                line-height: 1.6;
                font-size: 14px;
            }}
            .metric-box {{
                background: #f8f9fa;
                border-left: 4px solid {"#dc3545" if "CRITICAL" in subject else "#ffc107" if "WARNING" in subject else "#28a745"};
                padding: 16px;
                margin: 16px 0;
                border-radius: 0 8px 8px 0;
                font-family: 'Courier New', monospace;
                font-size: 13px;
            }}
            .footer {{
                padding: 16px 24px;
                background: #f8f9fa;
                color: #888;
                font-size: 12px;
                text-align: center;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                {subject}
            </div>
            <div class="body">
                <div class="metric-box">
                    {body_html}
                </div>
            </div>
            <div class="footer">
                Sensa-Smart Server Monitor &bull; {timestamp}<br>
                Email này được gửi tự động bởi hệ thống giám sát. Không cần trả lời.
            </div>
        </div>
    </body>
    </html>
    """


def send_email(
    host: str,
    port: int,
    user: str,
    password: str,
    sender: str,
    recipients: str,
    subject: str,
    body: str,
) -> None:
    """Gửi email HTML qua SMTP TLS."""
    # Parse danh sách email (comma-separated)
    to_list = [email.strip() for email in recipients.split(",") if email.strip()]

    if not to_list:
        print("[send_alert.py] Không có email nhận, bỏ qua.", file=sys.stderr)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(to_list)

    # Tạo cả plain text và HTML
    plain_text = f"{subject}\n\n{body}\n\nSensa-Smart Server Monitor"
    html_content = build_html_body(subject, body)

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
            server.sendmail(sender, to_list, msg.as_string())
        print(f"[send_alert.py] Email đã gửi tới: {', '.join(to_list)}")
    except Exception as e:
        print(f"[send_alert.py] Lỗi gửi email: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Sensa-Smart Alert Email Sender")
    parser.add_argument("--host", required=True, help="SMTP Host")
    parser.add_argument("--port", type=int, default=587, help="SMTP Port")
    parser.add_argument("--user", required=True, help="SMTP Username")
    parser.add_argument("--password", required=True, help="SMTP Password")
    parser.add_argument("--from", dest="sender", required=True, help="From address")
    parser.add_argument("--to", required=True, help="Comma-separated recipient emails")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--body", required=True, help="Email body text")

    args = parser.parse_args()
    send_email(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        sender=args.sender,
        recipients=args.to,
        subject=args.subject,
        body=args.body,
    )


if __name__ == "__main__":
    main()
