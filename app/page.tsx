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
  id: number; // 프론트 내부용
  name: string;
  part: Part;
  studentId: string; // 시트의 member_id 사용
};

const PARTS: Part[] = ["소프라노", "알토", "테너", "베이스"];
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

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [checkedBy, setCheckedBy] = useState<Checker>("소프라노 파트장");

  const [newName, setNewName] = useState("");
  const [newPart, setNewPart] = useState<Part>("소프라노");
  const [newStudentId, setNewStudentId] = useState("");

  const [savingMemberId, setSavingMemberId] = useState<number | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  const [attendanceStatus, setAttendanceStatus] = useState<Record<number, AttendanceStatus>>({});
  const [lateReasons, setLateReasons] = useState<Record<number, string>>({});

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
        alert("단원 목록 불러오기 실패: " + (result.error || "알 수 없는 오류"));
        return;
      }

      const loadedMembers: Member[] = (result.members || []).map(
        (
          item: {
            member_id: string;
            name: string;
            part: Part;
            student_id?: string;
          },
          index: number
        ) => ({
          id: index + 1,
          name: item.name,
          part: item.part,
          studentId: item.member_id, // 시트의 member_id를 그대로 사용
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

  async function handleAdminSave(member: Member) {
    const status = attendanceStatus[member.id] || "미체크";

    if (status === "미체크") {
      alert("미체크는 저장할 수 없습니다.");
      return;
    }

    if (status === "지각" && !(lateReasons[member.id] || "").trim()) {
      alert("지각 사유를 입력하세요.");
      return;
    }

    setSavingMemberId(member.id);

    try {
      const result = await saveAttendanceToSheet(member, status);

      if (!result.ok) {
        alert("저장 실패: " + (result.error || "알 수 없는 오류"));
        return;
      }

      alert(`${member.name} 저장 완료`);
    } catch (error) {
      console.error(error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSavingMemberId(null);
    }
  }

  async function addMember() {
    if (!newName.trim()) {
      alert("이름을 입력하세요.");
      return;
    }

    if (!newStudentId.trim()) {
      alert("학번을 입력하세요.");
      return;
    }

    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "member",
          action: "add",
          name: newName.trim(),
          part: newPart,
          student_id: newStudentId.trim(),
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        alert("단원 추가 실패: " + (result.error || "알 수 없는 오류"));
        return;
      }

      alert("단원 추가 완료");

      setNewName("");
      setNewPart("소프라노");
      setNewStudentId("");

      await loadMembers();
    } catch (error) {
      console.error(error);
      alert("단원 추가 중 오류가 발생했습니다.");
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
        members 시트에서 단원 목록을 자동으로 불러오고, 체크자에 따라 해당 파트만 표시됨
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
              onChange={(e) => setCheckedBy(e.target.value as Checker)}
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
        <div style={{ border: "1px solid #ddd", borderRadius: "10px", padding: "16px" }}>
          <div>출석</div>
          <strong style={{ fontSize: "24px" }}>{summary.present}</strong>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: "10px", padding: "16px" }}>
          <div>지각</div>
          <strong style={{ fontSize: "24px" }}>{summary.late}</strong>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: "10px", padding: "16px" }}>
          <div>결석</div>
          <strong style={{ fontSize: "24px" }}>{summary.absent}</strong>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: "10px", padding: "16px" }}>
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
        <h2 style={{ marginTop: 0 }}>임원용 전체 관리</h2>
        <p style={{ color: "#666", marginTop: "8px" }}>
          선택한 체크자의 파트 단원만 표시됨.
          <br />
          같은 날짜에 같은 단원을 다시 저장하면 마지막 입력값으로 덮어씀.
        </p>

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
                  <th style={thStyle}>시트 저장</th>
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
                            style={{ width: "180px", padding: "8px" }}
                          />
                        ) : (
                          <span style={{ color: "#999" }}>-</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleAdminSave(member)}
                          disabled={savingMemberId === member.id}
                          style={{
                            padding: "8px 12px",
                            cursor: savingMemberId === member.id ? "default" : "pointer",
                          }}
                        >
                          {savingMemberId === member.id ? "저장 중..." : "저장"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={7}>
                      해당 파트 단원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>단원 추가</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <input
            type="text"
            placeholder="이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: "100%", padding: "10px" }}
          />

          <select
            value={newPart}
            onChange={(e) => setNewPart(e.target.value as Part)}
            style={{ width: "100%", padding: "10px" }}
          >
            {PARTS.map((part) => (
              <option key={part} value={part}>
                {part}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="학번"
            value={newStudentId}
            onChange={(e) => setNewStudentId(e.target.value)}
            style={{ width: "100%", padding: "10px" }}
          />
        </div>

        <button
          onClick={addMember}
          style={{
            marginTop: "16px",
            padding: "12px 20px",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          단원 등록
        </button>
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