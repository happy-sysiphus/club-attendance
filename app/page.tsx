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
  studentId: string; // 시트의 member_id
};

type MemberApiItem = {
  member_id: string;
  name: string;
  part: Part;
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

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [savingMemberId, setSavingMemberId] = useState<number | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<number | null>(null);

  const [attendanceStatus, setAttendanceStatus] = useState<Record<number, AttendanceStatus>>({});
  const [lateReasons, setLateReasons] = useState<Record<number, string>>({});

  const currentPart = checkerToPart[checkedBy];
  const filteredMembers = members.filter((member) => member.part === currentPart);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    setLoadingMembers(true);

    try {
      const response = await fetch("/api/attendance?action=get_members", {
        method: "GET",
      });

      const result = await response.json();

      if (!result.ok) {
        alert("단원 목록 불러오기 실패: " + (result.error || "알 수 없는 오류"));
        return;
      }

      const loadedMembers: Member[] = (result.members as MemberApiItem[]).map((item, index) => ({
        id: Date.now() + index,
        name: item.name,
        part: item.part,
        studentId: item.member_id,
      }));

      setMembers(loadedMembers);

      const nextAttendanceStatus: Record<number, AttendanceStatus> = {};
      const nextLateReasons: Record<number, string> = {};

      loadedMembers.forEach((member) => {
        nextAttendanceStatus[member.id] = "미체크";
        nextLateReasons[member.id] = "";
      });

      setAttendanceStatus(nextAttendanceStatus);
      setLateReasons(nextLateReasons);
    } catch (error) {
      console.error(error);
      alert("단원 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoadingMembers(false);
    }
  }

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

    return await response.json();
  }

  async function saveMemberToSheet(member: { studentId: string; name: string; part: Part }) {
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "member",
        action: "add",
        member_id: member.studentId,
        name: member.name,
        part: member.part,
      }),
    });

    return await response.json();
  }

  async function deleteMemberFromSheet(memberId: string) {
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "member",
        action: "delete",
        member_id: memberId,
      }),
    });

    return await response.json();
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

  async function handleBulkSave() {
    if (filteredMembers.length === 0) {
      alert("현재 파트에 저장할 단원이 없습니다.");
      return;
    }

    const membersToSave = filteredMembers.filter(
      (member) => (attendanceStatus[member.id] || "미체크") !== "미체크"
    );

    if (membersToSave.length === 0) {
      alert("저장할 출석 상태가 없습니다. 먼저 상태를 선택하세요.");
      return;
    }

    const invalidLateMember = membersToSave.find((member) => {
      const status = attendanceStatus[member.id];
      return status === "지각" && !(lateReasons[member.id] || "").trim();
    });

    if (invalidLateMember) {
      alert(`${invalidLateMember.name}의 지각 사유를 입력하세요.`);
      return;
    }

    setIsBulkSaving(true);

    try {
      const results = await Promise.allSettled(
        membersToSave.map(async (member) => {
          const status = attendanceStatus[member.id] as Exclude<AttendanceStatus, "미체크">;
          const result = await saveAttendanceToSheet(member, status);

          if (!result.ok) {
            throw new Error(result.error || "알 수 없는 오류");
          }

          return member.name;
        })
      );

      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failedResults = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      const skippedCount = filteredMembers.length - membersToSave.length;

      let message = `일괄 저장 완료\n성공: ${successCount}명`;

      if (skippedCount > 0) {
        message += `\n미체크로 건너뜀: ${skippedCount}명`;
      }

      if (failedResults.length > 0) {
        message += `\n실패: ${failedResults.length}명`;
        const firstError = failedResults[0]?.reason;
        if (firstError instanceof Error) {
          message += `\n첫 오류: ${firstError.message}`;
        }
      }

      alert(message);
    } catch (error) {
      console.error(error);
      alert("일괄 저장 중 오류가 발생했습니다.");
    } finally {
      setIsBulkSaving(false);
    }
  }

  async function addMember() {
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

    setIsAddingMember(true);

    const newMember: Member = {
      id: Date.now(),
      name: newName.trim(),
      part: newPart,
      studentId: newStudentId.trim(),
    };

    try {
      const result = await saveMemberToSheet(newMember);

      if (!result.ok) {
        alert("단원 저장 실패: " + (result.error || "알 수 없는 오류"));
        return;
      }

      setMembers((prev) => [...prev, newMember]);
      setAttendanceStatus((prev) => ({
        ...prev,
        [newMember.id]: "미체크",
      }));
      setLateReasons((prev) => ({
        ...prev,
        [newMember.id]: "",
      }));

      setNewName("");
      setNewPart("소프라노");
      setNewStudentId("");

      alert("단원 등록 완료");
    } catch (error) {
      console.error(error);
      alert("단원 등록 중 오류가 발생했습니다.");
    } finally {
      setIsAddingMember(false);
    }
  }

  async function deleteMember(memberId: number) {
    const target = members.find((m) => m.id === memberId);
    if (!target) return;

    const ok = window.confirm(`${target.name} 단원을 삭제할까요?`);
    if (!ok) return;

    setDeletingMemberId(memberId);

    try {
      const result = await deleteMemberFromSheet(target.studentId);

      if (!result.ok) {
        alert("단원 삭제 실패: " + (result.error || "알 수 없는 오류"));
        return;
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));

      setAttendanceStatus((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });

      setLateReasons((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });

      if (savingMemberId === memberId) {
        setSavingMemberId(null);
      }

      alert("단원 삭제 완료");
    } catch (error) {
      console.error(error);
      alert("단원 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingMemberId(null);
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
      <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>GLEE 출석체크</h1>
      <p style={{ color: "#555", marginBottom: "24px" }}>
        오늘 날짜로 자동 저장되고, 체크자에 따라 해당 파트 단원만 표시됨
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

        <div style={{ marginTop: "16px", marginBottom: "16px" }}>
          <button
            onClick={handleBulkSave}
            disabled={isBulkSaving || loadingMembers}
            style={{
              padding: "10px 16px",
              border: "none",
              borderRadius: "8px",
              cursor: isBulkSaving || loadingMembers ? "default" : "pointer",
            }}
          >
            {isBulkSaving ? "일괄 저장 중..." : `현재 파트(${currentPart}) 일괄 저장`}
          </button>
        </div>

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
                <th style={thStyle}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {loadingMembers ? (
                <tr>
                  <td style={tdStyle} colSpan={8}>
                    단원 목록 불러오는 중...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={8}>
                    현재 파트에 등록된 단원이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const status = attendanceStatus[member.id] || "미체크";
                  const isLate = status === "지각";

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
                          disabled={
                            savingMemberId === member.id ||
                            isBulkSaving ||
                            deletingMemberId === member.id
                          }
                          style={{
                            padding: "8px 12px",
                            cursor:
                              savingMemberId === member.id ||
                              isBulkSaving ||
                              deletingMemberId === member.id
                                ? "default"
                                : "pointer",
                          }}
                        >
                          {savingMemberId === member.id ? "저장 중..." : "저장"}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => deleteMember(member.id)}
                          disabled={isBulkSaving || deletingMemberId === member.id}
                          style={{
                            padding: "8px 12px",
                            cursor:
                              isBulkSaving || deletingMemberId === member.id
                                ? "default"
                                : "pointer",
                          }}
                        >
                          {deletingMemberId === member.id ? "삭제 중..." : "삭제"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
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
          disabled={isAddingMember}
          style={{
            marginTop: "16px",
            padding: "12px 20px",
            border: "none",
            borderRadius: "8px",
            cursor: isAddingMember ? "default" : "pointer",
          }}
        >
          {isAddingMember ? "등록 중..." : "단원 등록"}
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