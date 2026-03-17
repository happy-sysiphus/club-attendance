"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Part = "소프라노" | "알토" | "테너" | "베이스";
type AttendanceStatus = "출석" | "지각" | "결석" | "미체크";
type Checker =
  | "소프라노 파트장"
  | "알토 파트장"
  | "테너 파트장"
  | "베이스 파트장";

type Member = {
  id: number;
  name: string;
  part: Part;
  studentId: string; // members 시트의 member_id 사용
};

type SaveState = "대기중" | "저장 중" | "저장 완료" | "저장 실패";

type SaveLog = {
  savedAt: string;
  part: Part;
  checker: Checker;
  count: number;
  details: string[];
};

const STATUS_OPTIONS: AttendanceStatus[] = ["출석", "지각", "결석", "미체크"];
const CHECKERS: Checker[] = [
  "소프라노 파트장",
  "알토 파트장",
  "테너 파트장",
  "베이스 파트장",
];

const checkerToPart: Record<Checker, Part> = {
  "소프라노 파트장": "소프라노",
  "알토 파트장": "알토",
  "테너 파트장": "테너",
  "베이스 파트장": "베이스",
};

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNowText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [checkedBy, setCheckedBy] = useState<Checker>("소프라노 파트장");

  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  const [attendanceStatus, setAttendanceStatus] = useState<Record<number, AttendanceStatus>>({});
  const [lateReasons, setLateReasons] = useState<Record<number, string>>({});

  const [saveState, setSaveState] = useState<SaveState>("대기중");
  const [saveMessage, setSaveMessage] = useState("아직 저장하지 않음");
  const [lastSaveLog, setLastSaveLog] = useState<SaveLog | null>(null);

  const [saveProgress, setSaveProgress] = useState(0);
  const [saveProgressText, setSaveProgressText] = useState("0 / 0");

  const currentPart = checkerToPart[checkedBy];
  const filteredMembers = members.filter((member) => member.part === currentPart);

  const summary = useMemo(() => {
    const statuses = filteredMembers.map((member) => attendanceStatus[member.id] || "미체크");

    return {
      present: statuses.filter((v) => v === "출석").length,
      late: statuses.filter((v) => v === "지각").length,
      absent: statuses.filter((v) => v === "결석").length,
      unchecked: statuses.filter((v) => v === "미체크").length,
    };
  }, [filteredMembers, attendanceStatus]);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    setIsLoadingMembers(true);

    try {
      const response = await fetch("/api/members", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!result.ok) {
        setSaveState("저장 실패");
        setSaveMessage("단원 목록 불러오기 실패");
        alert("단원 목록 불러오기 실패: " + (result.error || "알 수 없는 오류"));
        return;
      }

      const loadedMembers: Member[] = (result.members || []).map(
        (
          item: {
            member_id: string;
            name: string;
            part: Part;
          },
          index: number
        ) => ({
          id: index + 1,
          name: item.name,
          part: item.part,
          studentId: item.member_id,
        })
      );

      setMembers(loadedMembers);

      const nextStatus: Record<number, AttendanceStatus> = {};
      const nextLateReasons: Record<number, string> = {};

      loadedMembers.forEach((member) => {
        nextStatus[member.id] = "미체크";
        nextLateReasons[member.id] = "";
      });

      setAttendanceStatus(nextStatus);
      setLateReasons(nextLateReasons);
    } catch (error) {
      console.error(error);
      setSaveState("저장 실패");
      setSaveMessage("단원 목록 불러오기 중 오류 발생");
      alert("단원 목록 불러오기 중 오류가 발생했습니다.");
    } finally {
      setIsLoadingMembers(false);
    }
  }

  async function saveAttendanceToSheet(
    member: Member,
    status: Exclude<AttendanceStatus, "미체크">
  ) {
    const today = getToday();
    const note = status === "지각" ? (lateReasons[member.id] || "").trim() : "";

    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "attendance",
        session_id: today,
        date: today,
        member_id: member.studentId,
        name: member.name,
        part: member.part,
        status,
        checked_by: checkedBy,
        note,
      }),
    });

    const result = await response.json();
    return result;
  }

  function handleAdminChange(memberId: number, status: AttendanceStatus) {
    setAttendanceStatus((prev) => ({
      ...prev,
      [memberId]: status,
    }));

    if (status !== "지각") {
      setLateReasons((prev) => ({
        ...prev,
        [memberId]: "",
      }));
    }
  }

  async function handleBatchSave() {
    if (filteredMembers.length === 0) {
      alert("저장할 단원이 없습니다.");
      return;
    }

    const uncheckedMembers = filteredMembers.filter(
      (member) => (attendanceStatus[member.id] || "미체크") === "미체크"
    );

    if (uncheckedMembers.length > 0) {
      alert(
        "미체크 단원이 있어서 저장할 수 없습니다.\n\n" +
          uncheckedMembers.map((member) => member.name).join(", ")
      );
      return;
    }

    const lateWithoutReasonMembers = filteredMembers.filter((member) => {
      const status = attendanceStatus[member.id] || "미체크";
      return status === "지각" && !(lateReasons[member.id] || "").trim();
    });

    if (lateWithoutReasonMembers.length > 0) {
      alert(
        "지각 사유가 비어 있는 단원이 있습니다.\n\n" +
          lateWithoutReasonMembers.map((member) => member.name).join(", ")
      );
      return;
    }

    setIsBatchSaving(true);
    setSaveState("저장 중");
    setSaveMessage(`${currentPart} 파트 저장 중...`);
    setSaveProgress(0);
    setSaveProgressText(`0 / ${filteredMembers.length}`);

    const savedDetails: string[] = [];
    const total = filteredMembers.length;

    try {
      for (let i = 0; i < filteredMembers.length; i++) {
        const member = filteredMembers[i];
        const status = attendanceStatus[member.id] as Exclude<AttendanceStatus, "미체크">;

        const result = await saveAttendanceToSheet(member, status);

        if (!result.ok) {
          setSaveState("저장 실패");
          setSaveMessage(`${member.name} 저장 실패`);
          alert(`${member.name} 저장 실패: ` + (result.error || "알 수 없는 오류"));
          return;
        }

        const lateReason =
          status === "지각" ? ` / 사유: ${lateReasons[member.id] || ""}` : "";
        savedDetails.push(`${member.name} - ${status}${lateReason}`);

        const done = i + 1;
        const percent = Math.round((done / total) * 100);

        setSaveProgress(percent);
        setSaveProgressText(`${done} / ${total}`);
        setSaveMessage(`${currentPart} 파트 저장 중... (${done}/${total})`);
      }

      const savedAt = getNowText();

      setLastSaveLog({
        savedAt,
        part: currentPart,
        checker: checkedBy,
        count: filteredMembers.length,
        details: savedDetails,
      });

      setSaveState("저장 완료");
      setSaveMessage(`${currentPart} 파트 ${filteredMembers.length}명 저장 완료`);
      setSaveProgress(100);
      setSaveProgressText(`${total} / ${total}`);

      alert(`${currentPart} 파트 전체 저장 완료`);
    } catch (error) {
      console.error(error);
      setSaveState("저장 실패");
      setSaveMessage("일괄 저장 중 오류 발생");
      alert("일괄 저장 중 오류가 발생했습니다.");
    } finally {
      setIsBatchSaving(false);
    }
  }

  return (
    <main
      style={{
        padding: "30px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>동아리 출석체크</h1>
      <p style={{ color: "#555", marginBottom: "24px" }}>
        현재 파트 전체를 한 번에 저장하고, 저장 진행률과 최근 저장 결과를 확인할 수 있음
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>공통 설정</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <div>
            <label>날짜</label>
            <br />
            <input
              type="text"
              value={getToday()}
              readOnly
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "8px",
                backgroundColor: "#f5f5f5",
              }}
            />
          </div>

          <div>
            <label>체크자</label>
            <br />
            <select
              value={checkedBy}
              onChange={(e) => {
                setCheckedBy(e.target.value as Checker);
                setSaveProgress(0);
                setSaveProgressText("0 / 0");
              }}
              style={{ width: "100%", padding: "10px", marginTop: "8px" }}
            >
              {CHECKERS.map((checker) => (
                <option key={checker} value={checker}>
                  {checker}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>현재 표시 파트</label>
            <br />
            <input
              type="text"
              value={currentPart}
              readOnly
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "8px",
                backgroundColor: "#f5f5f5",
              }}
            />
          </div>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <div style={summaryCardStyle}>
          <div>출석</div>
          <strong style={{ fontSize: "24px" }}>{summary.present}</strong>
        </div>
        <div style={summaryCardStyle}>
          <div>지각</div>
          <strong style={{ fontSize: "24px" }}>{summary.late}</strong>
        </div>
        <div style={summaryCardStyle}>
          <div>결석</div>
          <strong style={{ fontSize: "24px" }}>{summary.absent}</strong>
        </div>
        <div style={summaryCardStyle}>
          <div>미체크</div>
          <strong style={{ fontSize: "24px" }}>{summary.unchecked}</strong>
        </div>
      </div>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>저장 확인</h2>

        <div
          style={{
            marginTop: "16px",
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            backgroundColor: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "8px" }}>저장 진행률</div>

          <div
            style={{
              width: "100%",
              height: "18px",
              backgroundColor: "#e5e5e5",
              borderRadius: "999px",
              overflow: "hidden",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                width: `${saveProgress}%`,
                height: "100%",
                backgroundColor: "#4f46e5",
                transition: "width 0.2s ease",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span>{saveProgress}%</span>
            <span>{saveProgressText}</span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>현재 저장 상태</div>
            <strong>{saveState}</strong>
          </div>

          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>상태 메시지</div>
            <strong>{saveMessage}</strong>
          </div>

          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>최근 저장 시간</div>
            <strong>{lastSaveLog ? lastSaveLog.savedAt : "-"}</strong>
          </div>

          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>최근 저장 파트</div>
            <strong>{lastSaveLog ? lastSaveLog.part : "-"}</strong>
          </div>

          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>최근 체크자</div>
            <strong>{lastSaveLog ? lastSaveLog.checker : "-"}</strong>
          </div>

          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>최근 저장 인원</div>
            <strong>{lastSaveLog ? `${lastSaveLog.count}명` : "-"}</strong>
          </div>
        </div>

        <div
          style={{
            marginTop: "16px",
            border: "1px solid #eee",
            borderRadius: "10px",
            padding: "16px",
            backgroundColor: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "8px" }}>최근 저장된 단원 목록</div>

          {lastSaveLog && lastSaveLog.details.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "20px" }}>
              {lastSaveLog.details.map((detail, index) => (
                <li key={`${detail}-${index}`} style={{ marginBottom: "6px" }}>
                  {detail}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: "#777" }}>아직 저장된 기록이 없음</div>
          )}
        </div>
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ marginTop: 0, marginBottom: "8px" }}>임원용 전체 관리</h2>
            <p style={{ color: "#666", margin: 0 }}>
              선택한 체크자의 파트 단원만 표시됨.
              <br />
              같은 날짜에 같은 단원을 다시 저장하면 마지막 입력값으로 덮어씀.
            </p>
          </div>

          <button
            onClick={handleBatchSave}
            disabled={isBatchSaving || isLoadingMembers || filteredMembers.length === 0}
            style={{
              padding: "12px 18px",
              border: "none",
              borderRadius: "8px",
              cursor:
                isBatchSaving || isLoadingMembers || filteredMembers.length === 0
                  ? "default"
                  : "pointer",
              fontWeight: 700,
            }}
          >
            {isBatchSaving ? `${currentPart} 저장 중...` : `${currentPart} 파트 일괄 저장`}
          </button>
        </div>

        {isLoadingMembers ? (
          <p style={{ marginTop: "16px" }}>단원 목록 불러오는 중...</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>member_id</th>
                  <th style={thStyle}>파트</th>
                  <th style={thStyle}>현재 상태</th>
                  <th style={thStyle}>변경</th>
                  <th style={thStyle}>지각 사유</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => {
                  const status = attendanceStatus[member.id] || "미체크";
                  const isLate = status === "지각";

                  return (
                    <tr key={member.studentId}>
                      <td style={tdStyle}>{member.name}</td>
                      <td style={tdStyle}>{member.studentId}</td>
                      <td style={tdStyle}>{member.part}</td>
                      <td style={tdStyle}>{status}</td>
                      <td style={tdStyle}>
                        <select
                          value={status}
                          onChange={(e) =>
                            handleAdminChange(member.id, e.target.value as AttendanceStatus)
                          }
                          style={{ padding: "8px", minWidth: "120px" }}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        {isLate ? (
                          <input
                            type="text"
                            value={lateReasons[member.id] || ""}
                            onChange={(e) =>
                              setLateReasons((prev) => ({
                                ...prev,
                                [member.id]: e.target.value,
                              }))
                            }
                            placeholder="지각 사유 입력"
                            style={{ width: "220px", padding: "8px" }}
                          />
                        ) : (
                          <span style={{ color: "#999" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={6}>
                      해당 파트 단원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const thStyle: CSSProperties = {
  borderBottom: "1px solid #ddd",
  padding: "10px",
  textAlign: "left",
  backgroundColor: "#f7f7f7",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "10px",
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: "10px",
  padding: "16px",
};

const statusCardStyle: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fafafa",
};

const statusLabelStyle: CSSProperties = {
  color: "#666",
  fontSize: "14px",
  marginBottom: "6px",
};