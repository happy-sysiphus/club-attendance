"use client";

import { useMemo, useState } from "react";

type Part = "소프라노" | "알토" | "테너" | "베이스";
type AttendanceStatus = "출석" | "지각" | "결석" | "미체크";

type Member = {
  id: number;
  name: string;
  part: Part;
  studentId: string; // 시트의 member_id로 사용
};

const initialMembers: Member[] = [
  { id: 1, name: "박은성", part: "베이스", studentId: "BAS001" },
];

const PARTS: Part[] = ["소프라노", "알토", "테너", "베이스"];
const STATUS_OPTIONS: AttendanceStatus[] = ["출석", "지각", "결석", "미체크"];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [checkedBy, setCheckedBy] = useState("총무");
  const [partFilter, setPartFilter] = useState<Part | "전체">("전체");

  const [newName, setNewName] = useState("");
  const [newPart, setNewPart] = useState<Part>("소프라노");
  const [newStudentId, setNewStudentId] = useState("");

  const [savingMemberId, setSavingMemberId] = useState<number | null>(null);

  const [attendanceStatus, setAttendanceStatus] = useState<Record<number, AttendanceStatus>>({
    1: "미체크",
    2: "미체크",
    3: "미체크",
    4: "미체크",
    5: "미체크",
    6: "미체크",
  });

  const filteredMembers =
    partFilter === "전체"
      ? members
      : members.filter((member) => member.part === partFilter);

  const summary = useMemo(() => {
    const statuses = filteredMembers.map((member) => attendanceStatus[member.id] || "미체크");

    return {
      present: statuses.filter((v) => v === "출석").length,
      late: statuses.filter((v) => v === "지각").length,
      absent: statuses.filter((v) => v === "결석").length,
      unchecked: statuses.filter((v) => v === "미체크").length,
    };
  }, [filteredMembers, attendanceStatus]);

  async function saveAttendanceToSheet(
    member: Member,
    status: Exclude<AttendanceStatus, "미체크">
  ) {
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: selectedDate,
        date: selectedDate,
        member_id: member.studentId,
        name: member.name,
        part: member.part,
        status,
        checked_by: checkedBy,
        note: "",
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
  }

  async function handleAdminSave(member: Member) {
    const status = attendanceStatus[member.id] || "미체크";

    if (status === "미체크") {
      alert("미체크는 저장할 수 없습니다.");
      return;
    }

    if (!selectedDate) {
      alert("날짜를 선택하세요.");
      return;
    }

    if (!checkedBy.trim()) {
      alert("체크자를 입력하세요.");
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

  function addMember() {
    if (!newName.trim()) {
      alert("이름을 입력하세요.");
      return;
    }

    if (!newStudentId.trim()) {
      alert("member_id를 입력하세요.");
      return;
    }

    const duplicate = members.some((m) => m.studentId === newStudentId.trim());

    if (duplicate) {
      alert("이미 있는 member_id입니다.");
      return;
    }

    const newMember: Member = {
      id: Date.now(),
      name: newName.trim(),
      part: newPart,
      studentId: newStudentId.trim(),
    };

    setMembers((prev) => [...prev, newMember]);
    setAttendanceStatus((prev) => ({
      ...prev,
      [newMember.id]: "미체크",
    }));

    setNewName("");
    setNewPart("소프라노");
    setNewStudentId("");
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
        같은 날짜 + 같은 member_id로 다시 저장하면 마지막 입력값으로 덮어씀
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
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: "100%", padding: "10px", marginTop: "8px" }}
            />
          </div>

          <div>
            <label>체크자</label>
            <br />
            <input
              type="text"
              value={checkedBy}
              onChange={(e) => setCheckedBy(e.target.value)}
              placeholder="예: 총무"
              style={{ width: "100%", padding: "10px", marginTop: "8px" }}
            />
          </div>

          <div>
            <label>파트 필터</label>
            <br />
            <select
              value={partFilter}
              onChange={(e) => setPartFilter(e.target.value as Part | "전체")}
              style={{ width: "100%", padding: "10px", marginTop: "8px" }}
            >
              <option value="전체">전체</option>
              {PARTS.map((part) => (
                <option key={part} value={part}>
                  {part}
                </option>
              ))}
            </select>
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
          저장 버튼을 누르면 현재 선택한 날짜 기준으로 시트에 저장됨.
          <br />
          같은 날짜에 같은 단원을 다시 저장하면 기존 값이 수정되는 게 아니라 마지막 값으로 덮어씀.
        </p>

        <div style={{ overflowX: "auto", marginTop: "16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>member_id</th>
                <th style={thStyle}>파트</th>
                <th style={thStyle}>현재 상태</th>
                <th style={thStyle}>변경</th>
                <th style={thStyle}>시트 저장</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => {
                const status = attendanceStatus[member.id] || "미체크";

                return (
                  <tr key={member.id}>
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
            </tbody>
          </table>
        </div>
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
            placeholder="member_id 예: SOP004"
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

const thStyle = {
  borderBottom: "1px solid #ddd",
  padding: "10px",
  textAlign: "left" as const,
  backgroundColor: "#f7f7f7",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "10px",
};